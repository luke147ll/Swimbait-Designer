/**
 * BaitBridge — handles handoff from Swimbait Designer to Mold Generator.
 *
 * Two transfer modes:
 * 1. Primitives JSON (new system) — rebuilds identical Manifold solid
 * 2. Binary STL (legacy/import) — builds from profile ellipsoids
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, mSphere, type ManifoldSolid } from './csg';
import { buildBait, buildBaitFromStationData, buildBaitFromMeshData, type BaitPrimitive, type StationData } from './BaitPrimitives';
import type { SlotConfig } from './types';

const INCHES_TO_MM = 25.4;
const API_BASE = 'https://swimbaitdesigner.com';

export function getTransferToken(): string | null {
  return new URLSearchParams(window.location.search).get('transfer');
}

function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(buffer);
  const triCount = dv.getUint32(80, true);
  const positions = new Float32Array(triCount * 9);
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    off += 12;
    for (let v = 0; v < 3; v++) {
      positions[t * 9 + v * 3] = dv.getFloat32(off, true); off += 4;
      positions[t * 9 + v * 3 + 1] = dv.getFloat32(off, true); off += 4;
      positions[t * 9 + v * 3 + 2] = dv.getFloat32(off, true); off += 4;
    }
    off += 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build Manifold from profile ellipsoids (fallback for STL imports)
 */
function buildFromVertices(positions: Float32Array, vertCount: number): ManifoldSolid {
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < vertCount; i++) {
    pts.push({
      x: positions[i * 3] * INCHES_TO_MM,
      y: positions[i * 3 + 1] * INCHES_TO_MM,
      z: positions[i * 3 + 2] * INCHES_TO_MM,
    });
  }
  let minX = Infinity, maxX = -Infinity, sumY = 0, sumZ = 0;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; sumY += p.y; sumZ += p.z; }
  const cy = sumY / pts.length, cz = sumZ / pts.length;
  const cx = (minX + maxX) / 2;
  for (const p of pts) { p.x -= cx; p.y -= cy; p.z -= cz; }
  const lenX = maxX - minX;

  const stations = 48;
  const sw = lenX / stations * 0.6;
  let result: ManifoldSolid | null = null;

  for (let s = 0; s <= stations; s++) {
    const sx = -lenX / 2 + (s / stations) * lenX;
    let sMinY = Infinity, sMaxY = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity, cnt = 0;
    for (const p of pts) {
      if (Math.abs(p.x - sx) <= sw) { if (p.y < sMinY) sMinY = p.y; if (p.y > sMaxY) sMaxY = p.y; if (p.z < sMinZ) sMinZ = p.z; if (p.z > sMaxZ) sMaxZ = p.z; cnt++; }
    }
    if (cnt < 3) continue;
    const hH = (sMaxY - sMinY) / 2, hW = (sMaxZ - sMinZ) / 2, sCy = (sMinY + sMaxY) / 2;
    if (hH < 0.5 || hW < 0.5) continue;
    const xStr = Math.max(lenX / stations * 0.65, 1);
    let e = mSphere(1, 16).scale([xStr, hH, hW]).translate([sx, sCy, 0]);
    result = result ? result.add(e) : e;
  }
  if (!result) throw new Error('No cross-sections');
  return result;
}

export async function transferBaitFromAPI(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[BaitBridge] Fetching transfer:', token);
    const res = await fetch(`${API_BASE}/api/mold-transfer?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'Transfer expired. Click "Generate Mold" again.' };
      return { success: false, error: `API error: ${res.status}` };
    }

    const contentType = res.headers.get('Content-Type') || '';
    const store = useMoldStore.getState();
    await initCSG();

    // Check if it's JSON (mesh/stations/primitives) or binary (STL)
    if (contentType.includes('application/json')) {
      const data = await res.json();
      console.log(`[BaitBridge] JSON transfer, type: ${data.type}, keys: ${Object.keys(data).join(',')}`);

      // Manifold mesh transfer (tube mesh from designer) — preferred path
      if (data.type === 'manifold_mesh' && data.vertProperties && data.triVerts) {
        console.log(`[BaitBridge] Mesh transfer: ${data.vertProperties.length / 3} verts, ${data.triVerts.length / 3} tris`);
        let { manifold, geometry } = await buildBaitFromMeshData(data.vertProperties, data.triVerts);

        // Union components with the bait so they all subtract from the mold together
        const comps = data.components || [];
        if (comps.length > 0) {
          console.log(`[BaitBridge] Processing ${comps.length} component(s)`);
          const { mFromMesh: mfm } = await import('./csg');
          for (const comp of comps) {
            try {
              let compManifold;

              // Fins with finParams: use native Manifold box with transform
              if (comp.finParams && comp.finParams.outline) {
                const fp = comp.finParams;
                const { mBox: mB } = await import('./csg');

                // Get fin dimensions from the outline
                const outline = fp.outline;
                let oMinX = Infinity, oMaxX = -Infinity, oMinY = Infinity, oMaxY = -Infinity;
                for (const p of outline) {
                  if (p.x < oMinX) oMinX = p.x; if (p.x > oMaxX) oMaxX = p.x;
                  if (p.y < oMinY) oMinY = p.y; if (p.y > oMaxY) oMaxY = p.y;
                }
                const finW = oMaxX - oMinX;
                const finH = oMaxY - oMinY;

                // Build as a centered box (Manifold native — clean and fast)
                let finSolid = mB(finW, finH, fp.thickness);

                // Apply the component's transform
                const t = comp.transform;
                if (t) {
                  if (t.scale && (t.scale.x !== 1 || t.scale.y !== 1 || t.scale.z !== 1)) {
                    finSolid = finSolid.scale([t.scale.x, t.scale.y, t.scale.z]);
                  }
                  if (t.rotation && (t.rotation.x || t.rotation.y || t.rotation.z)) {
                    finSolid = finSolid.rotate([t.rotation.x, t.rotation.y, t.rotation.z]);
                  }
                  if (t.position) {
                    finSolid = finSolid.translate([t.position.x, t.position.y, t.position.z]);
                  }
                }

                compManifold = finSolid;
                console.log(`[BaitBridge] Fin box: ${comp.label}, ${finW.toFixed(1)}×${finH.toFixed(1)}×${fp.thickness}mm, pos=[${t?.position?.x?.toFixed(1)},${t?.position?.y?.toFixed(1)},${t?.position?.z?.toFixed(1)}]`);
              } else {
                // Standard mesh component
                const cvp = new Float32Array(comp.vertProperties);
                let cMinX=Infinity,cMaxX=-Infinity,cMinY=Infinity,cMaxY=-Infinity,cMinZ=Infinity,cMaxZ=-Infinity;
                for (let i = 0; i < cvp.length; i += 3) {
                  if(cvp[i]<cMinX)cMinX=cvp[i]; if(cvp[i]>cMaxX)cMaxX=cvp[i];
                  if(cvp[i+1]<cMinY)cMinY=cvp[i+1]; if(cvp[i+1]>cMaxY)cMaxY=cvp[i+1];
                  if(cvp[i+2]<cMinZ)cMinZ=cvp[i+2]; if(cvp[i+2]>cMaxZ)cMaxZ=cvp[i+2];
                }
                console.log(`[BaitBridge] Component ${comp.label} bounds: X[${cMinX.toFixed(1)},${cMaxX.toFixed(1)}] Y[${cMinY.toFixed(1)},${cMaxY.toFixed(1)}] Z[${cMinZ.toFixed(1)},${cMaxZ.toFixed(1)}]`);
                compManifold = mfm(cvp, new Uint32Array(comp.triVerts));
              }

              manifold = manifold.add(compManifold);
              console.log(`[BaitBridge] Unioned component: ${comp.label}`);
            } catch (e) {
              console.warn(`[BaitBridge] Component ${comp.label} failed Manifold union:`, e);
            }
          }
          // Rebuild display geometry from the combined manifold
          const { manifoldToThree: m2t } = await import('./csg');
          geometry = m2t(manifold);
        }

        // Eye sockets — build native Manifold cylinders and subtract from bait
        const eyeData = data.eyeSockets;
        if (eyeData && eyeData.radius && eyeData.radius > 0) {
          const recessDepth = eyeData.recessDepth || 0.5;
          console.log(`[BaitBridge] Subtracting eye sockets: r=${eyeData.radius.toFixed(1)}mm, depth=${recessDepth}mm at X=${eyeData.stationX.toFixed(1)}, Y=${eyeData.vOff.toFixed(1)}`);
          try {
            const { mCylZ, manifoldToThree: m2t2 } = await import('./csg');
            // Get bait half-width from bounds to position cylinders at the surface
            geometry.computeBoundingBox();
            const halfZ = geometry.boundingBox!.max.z;
            // Cylinder length = recess depth + margin to punch through surface
            const cylLen = recessDepth + 2; // 2mm extra to ensure clean subtraction
            for (const side of [1, -1]) {
              // Position: start outside the bait surface, extend inward by recessDepth
              // mCylZ is centered — shift so one end is at the surface
              const surfaceZ = side * halfZ;
              const centerZ = surfaceZ - side * (cylLen / 2 - 0.5); // 0.5mm past surface
              const cyl = mCylZ(eyeData.radius, cylLen, 32)
                .translate([eyeData.stationX, eyeData.vOff, centerZ]);
              manifold = manifold.subtract(cyl);
            }
            geometry = m2t2(manifold);
            console.log(`[BaitBridge] Eye sockets subtracted (halfZ=${halfZ.toFixed(1)}mm)`);
          } catch (e) {
            console.warn(`[BaitBridge] Eye socket subtraction failed:`, e);
          }
        }

        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        console.log(`[BaitBridge] Built from mesh: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

        store.setBaitMesh(geometry, data.name || 'designed_bait');
        store.setBaitManifold(manifold);

        // Store slot configs
        const slotsData: SlotConfig[] = data.slots || [];
        if (slotsData.length > 0) {
          console.log(`[BaitBridge] ${slotsData.length} slot config(s) stored for mold subtraction`);
          store.setSlotConfigs(slotsData);
        }

        window.history.replaceState({}, '', window.location.pathname);
        return { success: true };
      }

      // Stations transfer (spline-driven ellipsoids) — fallback path
      if (data.type === 'stations' && data.stations) {
        console.log(`[BaitBridge] Stations transfer: ${data.stations.length} stations`);
        const { manifold, geometry } = await buildBaitFromStationData(data.stations as StationData[]);

        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        console.log(`[BaitBridge] Built from stations: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

        store.setBaitMesh(geometry, data.name || 'designed_bait');
        store.setBaitManifold(manifold);

        window.history.replaceState({}, '', window.location.pathname);
        return { success: true };
      }

      // Primitives transfer — rebuild identical Manifold solid
      if (data.type === 'primitives' && data.primitives) {
        console.log(`[BaitBridge] Primitives transfer: ${data.primitives.length} primitives`);
        const { manifold, geometry } = await buildBait(data.primitives as BaitPrimitive[]);

        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        console.log(`[BaitBridge] Built: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

        store.setBaitMesh(geometry, data.name || 'designed_bait');
        store.setBaitManifold(manifold);

        window.history.replaceState({}, '', window.location.pathname);
        return { success: true };
      }

      // JSON was parsed but type not recognized
      return { success: false, error: `Unknown JSON transfer type: ${data.type || 'missing'}` };
    }

    // Binary STL transfer (legacy/import)
    const buffer = await res.arrayBuffer();
    console.log(`[BaitBridge] STL transfer: ${buffer.byteLength} bytes`);

    if (buffer.byteLength < 84) return { success: false, error: 'Invalid data' };
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const expectedSize = 80 + 4 + triCount * 50;
    if (Math.abs(buffer.byteLength - expectedSize) > 10) return { success: false, error: 'STL size mismatch' };

    const geo = parseSTL(buffer);
    geo.scale(INCHES_TO_MM, INCHES_TO_MM, INCHES_TO_MM);
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeVertexNormals();
    geo.computeBoundingBox();

    store.setBaitMesh(geo, 'designed_bait.stl');

    // Build Manifold from profile ellipsoids
    try {
      const rawPos = parseSTL(buffer).attributes.position.array as Float32Array;
      const manifold = buildFromVertices(rawPos, rawPos.length / 3);
      store.setBaitManifold(manifold);
      console.log('[BaitBridge] Built Manifold from profile ellipsoids');
    } catch (e) {
      console.warn('[BaitBridge] Manifold build failed:', e);
      store.setBaitManifold(null);
    }

    window.history.replaceState({}, '', window.location.pathname);
    return { success: true };
  } catch (e) {
    return { success: false, error: `Transfer failed: ${e}` };
  }
}
