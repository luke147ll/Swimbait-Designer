# SBD Dev Log — 2026-04-05

## Session Summary

Major architecture shift: replaced primitive-based editor with spline-driven tube mesh fed directly to Manifold's constructor. Full end-to-end pipeline now working from designer through mold export.

## Changes Made

### Designer — Spline-Driven Tube Mesh

**Problem:** The primitive editor (spheres/cylinders/cones) worked for CSG but gave the user no intuitive shape control. The original spline editors were great UX but produced non-manifold triangle meshes.

**Solution:** Spline editors drive a watertight tube mesh. The tube mesh is built specifically for Manifold's constructor — no boolean unions, no mesh conversion.

- Restored all slider sections (body, head, profile, peduncle, tail, features) and spline editor containers (side profile, width profile, cross-section)
- Created `tube-mesh.js`: builds `(NS+1) × RS` ring vertices + 2 cone-fan cap centers. Quad strips between rings, `(j+1)%RS` wrapping — single watertight mesh. No collapsed rings, no seam, no mirrored half-shells.
- Cross-section editor wired in: `getXSecAtRing()` returns normalized polygons at each station, linearly resampled to match any RS. Every station gets a polygon (blended keyframe or default super-ellipse) — no shape discontinuity at blend boundaries.
- Tube mesh convention: X=length, Y=height, Z=width (matches old engine)

### Resolution System

- Four presets: Draft (30×24), Standard (60×48), High (80×64), Ultra (96×96)
- Draft resolution during active editing (slider drag, profile drag, xsec edit)
- Auto-upgrades to user's chosen resolution after 1s idle
- Dropdown in UI replaces old station count slider

### Mold Generator — Direct Mesh Transfer

- Designer sends raw `vertProperties + triVerts` arrays via KV transfer
- Mold generator creates Manifold via `new Manifold(new Mesh({...}))` — mesh built for this constructor
- `mFromMesh()` in csg.ts with merge vector fallback
- No rotation needed — mesh already has X=length (mold convention)
- Fixed `body stream already read` error: early return after JSON parsing prevents falling through to `arrayBuffer()`

### Zero-Overlap Mold Halves

- Removed 0.5mm box overlap in BaitSubtraction
- Removed 0.05mm parting overlap in MoldBox
- Both halves meet exactly at Z=0 — perimeter key now visible

### Perimeter Key Clearance

- Key frame and recess get cylindrical clearance holes (pin diameter + 2mm) at every pin and bolt position
- MoldEngine pre-computes clamp bolt positions and passes them to alignment generator

### Alignment Pin Repositioning

- Pins moved inboard: 20mm X inset (was 12mm), wallMarginX × 0.25 Y offset (was 0.5)

### Slot Insert System

- Slot state with width/length/depth/position controls, enable/disable toggle, add/remove
- Semi-transparent orange box preview with `depthTest: false` (X-ray overlay, visible through bait)
- Slots subtract from MOLD (not bait) — creates pocket in cavity
- Insert card generation: box matching slot dimensions minus 0.15mm clearance per side
- Green transparent insert card preview in mold generator viewport
- Export panel shows insert card STL download buttons
- Slot configs persist in design state and transfer to mold generator

### Injection Port Updates

- Bore diameter minimum lowered to 1mm (was 5mm)
- Z Offset slider (-20 to +20mm) shifts entire sprue assembly vertically
- Removed corner radius and draft angle sliders from config panel

### Vent Fix

- Vents were positioned at Z=+1.85mm (above halfA which extends Z<0)
- Fixed: channel top face at Z=0, cuts downward by ventDepth into parting surface
- Direction logic fixed to use relative coordinates (pos - center)

### Print Orientation Presets

- Three presets: On Edge (recommended), Flat (face down), Flat (face up)
- On Edge: 3-sided perimeter key — bottom (-Y) segment removed (sits on build plate)
- On Edge: 45° chamfer on top (+Y) key segment (horizontal overhang)
- Droop compensation: +0.2mm pin sockets, +0.3mm bolt holes on top-edge (+Y) positions
- Auto-regeneration on orientation toggle via useMoldEngine dependency

### Scalable Watermark

- Pixel font: 12 characters (S,W,I,M,B,A,T,D,E,G,N,R) built from Manifold boxes
- Auto-scales to fill mold face width with 10mm margin, capped at 30% height
- Half A (-Z face): "SWIMBAIT", Half B (+Z face): "DESIGNER"
- 1.5mm deep voids, min 0.6mm stroke width
- Toggle in Mold Body panel (default on)
- **Known issue:** May produce non-manifold edges at letter intersections. Slicers auto-repair.

### Mobile Fixes

- "Mold ▶" button added to mobile tab bar (always accessible)
- Generate Mold opens window before async fetch (mobile popup blocker fix)
- Compact mobile layout: 60/40 viewport split, 36px tab bar

### Build/Deploy Fixes

- `rm -rf node_modules/.tmp` before tsc to bust stale `.tsbuildinfo` cache
- Removed unused imports/vars causing TS strict mode failures
- Multiple empty commits to force Cloudflare Pages rebuilds past cached failures

## Architecture

```
DESIGNER (vanilla JS + Three.js)
  Spline editors → profileState (dorsalCache, ventralCache, widthCache)
  ↓
  tube-mesh.js: buildTubeMesh(getDorsal, getVentral, getWidth, lengthMM, NS, RS, getXSec)
  ↓
  Three.js BufferGeometry (viewport preview, mm scaled to inches)
  ↓
  sendToMoldGenerator: POST vertProperties + triVerts + slotConfigs to KV

MOLD GENERATOR (React + TypeScript + Manifold WASM)
  BaitBridge: receives mesh arrays + slot configs
  ↓
  mFromMesh(vertProperties, triVerts) → native Manifold solid
  ↓
  MoldEngine pipeline:
    1. Validate mesh
    2. Box + subtract bait (zero overlap at Z=0)
    3. Alignment: pins + perimeter key (3-sided for on-edge, clearance holes)
    4. Clamps: bolt holes (droop compensation for on-edge)
    5. Sprue: injection port with Z offset
    6. Vents: channels on parting face
    7. Slots: subtract from mold, generate insert cards
    8. Watermark: SWIMBAIT/DESIGNER void text
    9. Convert to Three.js → viewport + STL export
```

## Known Issues

1. **Watermark non-manifold edges** — pixel font letter strokes may create non-manifold edges where boxes share faces. Slicers handle this but could be fixed by adding tiny offsets between adjacent strokes.
2. **Cross-section editor interaction** — the xsec editor polygon affects the tube mesh shape but the visual feedback could be more intuitive.
3. **Print orientation key chamfer** — the 45° chamfer on the +Y key edge uses a rotated box approximation that may not produce a clean wedge in all cases.

## Files Modified

### Designer (`files (6)/`)
| File | Changes |
|------|---------|
| `index.html` | Restored sliders, editors, slot UI, resolution dropdown, mobile tab bar |
| `js/app.js` | Full rewrite: spline pipeline, tube mesh preview, slot system, resolution, mobile fixes |
| `js/tube-mesh.js` | NEW: watertight tube mesh builder with xsec support and resolution presets |
| `css/main.css` | Compact mobile layout |

### Mold Generator (`mold-generator/src/`)
| File | Changes |
|------|---------|
| `core/csg.ts` | `mFromMesh()`, sphere segments to 48 |
| `core/BaitPrimitives.ts` | `buildBaitFromMeshData()`, `subtractSlotsFromMold()`, `generateInsertCard()` |
| `core/BaitBridge.ts` | manifold_mesh + stations + slots handling, body-stream fix |
| `core/MoldEngine.ts` | Print orientation, slot subtraction, watermark, clamp position pre-compute |
| `core/types.ts` | SlotConfig, InsertCard, PrintOrientation, watermarkEnabled |
| `core/constants.ts` | Sprue offsetZ default, sample bait segments |
| `core/geometry/BaitSubtraction.ts` | Zero overlap |
| `core/geometry/MoldBox.ts` | Zero overlap |
| `core/geometry/AlignmentFeatures.ts` | Key clearance, 3-sided key, droop compensation |
| `core/geometry/ClampFeatures.ts` | Droop compensation |
| `core/geometry/SprueCutter.ts` | Z offset |
| `core/geometry/VentCutter.ts` | Fixed Z position and direction |
| `core/geometry/Watermark.ts` | NEW: pixel font watermark system |
| `store/moldStore.ts` | slotConfigs, insertCards, watermarkEnabled |
| `store/printerStore.ts` | printOrientation |
| `hooks/useMoldEngine.ts` | Watch slots, watermark, orientation |
| `ui/panels/MoldConfigPanel.tsx` | Watermark toggle, removed draft/corner sliders |
| `ui/panels/SpruePanel.tsx` | Bore min 1mm, Z offset slider |
| `ui/panels/PrinterSelector.tsx` | Orientation radio buttons |
| `ui/panels/ExportPanel.tsx` | Insert card export buttons |
| `ui/panels/BaitLoader.tsx` | Removed sample bait button |
| `ui/viewport/MoldPreview.tsx` | Insert card green mesh preview |
| `package.json` | Build cache fix |

## Test Print

First test print initiated at end of session. Slicer reported non-manifold edges (likely watermark-related), auto-repaired on import.
