import * as THREE from 'three';
import type { GeneratorType, TextureZone } from './types';

export class ZoneManager {
  private zones: Map<string, TextureZone> = new Map();

  createZone(name: string, generator: GeneratorType): TextureZone {
    const zone: TextureZone = {
      id: crypto.randomUUID(),
      name,
      generator,
      params: this.getDefaultParams(generator),
      vertexMask: [],
      depthOverride: 1.0,
    };
    this.zones.set(zone.id, zone);
    return zone;
  }

  removeZone(id: string): void { this.zones.delete(id); }

  getZone(id: string): TextureZone | undefined { return this.zones.get(id); }

  getAllZones(): TextureZone[] { return Array.from(this.zones.values()); }

  paintZone(zoneId: string, vertexIndices: number[]): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.vertexMask = [...new Set([...zone.vertexMask, ...vertexIndices])];
  }

  unpaintZone(zoneId: string, vertexIndices: number[]): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const removeSet = new Set(vertexIndices);
    zone.vertexMask = zone.vertexMask.filter(i => !removeSet.has(i));
  }

  getZonesForVertex(vertexIndex: number): TextureZone[] {
    return this.getAllZones().filter(z => z.vertexMask.includes(vertexIndex));
  }

  private getDefaultParams(generator: GeneratorType): Record<string, number> {
    switch (generator) {
      case 'cycloid': return { scale_size: 3.0, overlap: 0.3, depth: 0.15, row_offset: 0.5, randomize: 0.1 };
      case 'ctenoid': return { scale_size: 3.0, spine_count: 6, spine_depth: 0.05, depth: 0.15, randomize: 0.1 };
      case 'ganoid': return { scale_size: 5.0, depth: 0.25, bevel: 0.5 };
      case 'micro': return { density: 40, depth: 0.05 };
      case 'fin_rays': return { ray_count: 12, ray_width: 0.3, ray_depth: 0.12, spread_angle: 45, membrane_depth: 0.04 };
      case 'lateral_line': return { width: 0.5, depth: 0.1, pore_spacing: 2.0, pore_size: 0.3 };
      case 'skin_bump': return { frequency: 3.0, amplitude: 0.05, octaves: 2 };
      case 'smooth': return {};
      default: return {};
    }
  }

  autoGenerateZones(_baitMesh: THREE.BufferGeometry): TextureZone[] {
    console.log('[ZoneManager] autoGenerateZones — Phase 2 stub');
    return [];
  }
}
