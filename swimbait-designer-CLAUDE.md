# CLAUDE.md — Swimbait Designer

## Project overview

Browser-based parametric swimbait modeler. Users design custom soft plastic
swimbait profiles using sliders and presets, then export STL files for 3D
printing a master bait or pour mold. No installs — runs entirely client-side
on Cloudflare Pages.

Target audience: fishermen who want to design and pour their own soft plastic
swimbaits but lack CAD skills. Secondary audience: small bait builders who
want faster iteration on new designs.

## Tech stack

- Pure HTML/CSS/JS (no framework — keep it lean and fast)
- Three.js r128+ for 3D viewport
- Parametric geometry engine (custom — station-based lofting)
- STL export via client-side generation
- Hosted on Cloudflare Pages (static site)
- Future: user accounts via Cloudflare Workers + KV for saved designs

## Current state (v0.3)

Working prototype with:
- 9-station lofting engine with Catmull-Rom interpolation
- Super-ellipse cross-sections with dorsal/ventral asymmetry
- 8 species presets (shad, gizzard, bluegill, trout, herring, perch, hitch, minnow)
- 5 tail types (paddle, wedge, boot, split, fork)
- Basic eye geometry (sphere + pupil)
- Hook slot and weight pocket indicators
- STL export (ASCII format)
- Orbit/zoom camera controls
- Color swatches

The body shape is functional but needs refinement. Head/face area is too
simple. No fins, gills, mouth, or surface detail yet.

## Architecture

### Geometry engine

The body is generated using station-based lofting — the same approach used
in naval architecture software (DELFTship, FREE!ship, PolyCAD). Key concepts:

**Stations:** 9 cross-section control points along the body axis. Each station
defines: half-height (h), half-width (w), center Y offset (cy), dorsal extra,
belly extra, and super-ellipse exponent (n).

**Lofting:** Catmull-Rom spline interpolation between stations produces smooth
intermediate cross-sections at every mesh segment.

**Super-ellipse:** Each cross-section uses the formula `(|x|/a)^n + (|y|/b)^n = 1`
where n controls the shape — 2.0 is a true ellipse, higher values are more
rectangular. Dorsal and ventral halves can differ.

**Tail:** Separate geometry system after the tail-base station. Each tail type
(paddle, wedge, boot, split, fork) has its own parametric profile function.

### Coordinate system

- X axis = body length (nose at -L/2, tail at +L/2)
- Y axis = dorsal-ventral (dorsal is +Y)
- Z axis = lateral (left/right symmetry around Z=0)
- All dimensions in inches (matching fishing industry convention)
- The model is always centered at origin

### File structure (target)

```
swimbait-designer/
  index.html              — app shell, panel layout, slider controls
  css/
    main.css              — all styles (DM Mono + Instrument Serif fonts)
  js/
    app.js                — init, render loop, camera, UI wiring
    engine.js             — station builder, lofting, super-ellipse, mesh gen
    anatomy.js            — fish anatomy features (eyes, gills, fins, mouth)
    tails.js              — tail type geometry generators
    presets.js            — species preset parameter sets
    export-stl.js         — STL file generation and download
    export-mold.js        — (future) mold split + pour channel generation
  assets/
    (none currently — all procedural)
  CLAUDE.md               — this file
```

---

## FEATURE SPEC — Full target feature list

### P0: Body geometry (DONE — needs refinement)

- [x] 9-station lofting with Catmull-Rom interpolation
- [x] Super-ellipse cross-sections
- [x] Dorsal arch (additive offset, not multiplicative)
- [x] Belly fullness (additive offset)
- [x] Adjustable girth position
- [x] Head bluntness / snout shape
- [x] Caudal peduncle (stalk thickness, length, compression)
- [x] Body taper rate
- [ ] **Refine head shape** — currently too uniform/blobby. Need distinct
      snout-to-forehead transition. Head should narrow toward the mouth
      and widen at the cheeks/operculum.
- [ ] **Lateral line groove** — subtle surface indent running from operculum
      to caudal peduncle at the midline. Cosmetic but makes it read as fish.
- [ ] **Body cross-section preview** — small 2D inset showing the current
      cross-section shape at the selected station. Helps user understand
      what the super-ellipse exponent and asymmetry are doing.

### P0: Tail geometry (DONE — needs refinement)

- [x] Paddle tail
- [x] Wedge tail
- [x] Boot tail
- [x] Split tail
- [x] Fork tail
- [ ] **Paddle tail disc shape** — the paddle should be a distinct flat disc
      at the end, not a gradual swell. Real paddle tails have a thin stalk
      connecting to a wide, flat, circular paddle. The stalk-to-paddle
      transition should be abrupt.
- [ ] **Boot tail kick geometry** — the boot should have a thin stalk that
      drops down and then kicks out at ~45 degrees with a flat fin surface.
- [ ] **Fork tail lobes** — two distinct thin lobes diverging from the stalk
      at a user-controlled spread angle.
- [ ] **Tail thickness control** — independent control of how flat/thick
      the tail is laterally. Most tails are very thin (essentially 2D).

### P1: Eyes

Current state: simple sphere + smaller pupil sphere. Needs:

- [ ] **Eye socket depression** — the eye should sit in a shallow concavity
      on the head surface, not float on top. Boolean subtraction or vertex
      displacement to create a dish/socket.
- [ ] **Eye position controls:**
  - Longitudinal position (how far forward/back on head) — slider
  - Vertical position (high-riding vs low on face) — slider
  - Eye spacing (how far apart laterally) — slider
- [ ] **Eye size** — already exists but should map to realistic proportions.
      Typical eye diameter is 15-25% of head length for most forage species.
- [ ] **Eye anatomy layers:**
  - Sclera (white outer, slightly recessed)
  - Iris (colored ring — user color pick)
  - Pupil (black center, slightly protruding for 3D effect)
- [ ] **Eye orientation** — eyes should look slightly forward and down,
      not straight out to the side. Angle control or auto-orient.

### P1: Mouth

Currently no mouth geometry at all. Needs:

- [ ] **Mouth slit** — a crease/groove on the front of the head defining
      the jaw line. Vertex displacement along a curve from the chin up
      to the snout midline.
- [ ] **Mouth gape** — how wide the mouth opens. 0 = closed slit,
      higher values = partially open revealing a concave interior.
- [ ] **Jaw type:**
  - Terminal (mouth at front center — bass, shad)
  - Subterminal (mouth slightly below center — carp, sucker)
  - Superior (mouth angled upward — surface feeders)
- [ ] **Lower jaw protrusion** — for species like bass where the lower
      jaw extends slightly past the upper.
- [ ] **Lip thickness** — subtle ridge around the mouth opening.

### P1: Gill plate (operculum)

Currently no visual indication of where the head ends and body begins.

- [ ] **Gill slit line** — a curved groove/crease running from behind the
      eye down to the throat, marking the posterior edge of the operculum.
      This is the single most important anatomical landmark for making the
      shape read as "fish" rather than "blob."
- [ ] **Gill slit shape** — slight concave curve, wider at the bottom
      than the top. Should follow the natural curve of the head station
      cross-section at that point.
- [ ] **Gill flare** — subtle outward flare of the operculum edge.
      On some species (bluegill, bass) the gill plate has a distinct
      angular edge. Control for how pronounced this is.
- [ ] **Preopercle ridge** — secondary line in front of the gill slit
      visible on some species. Optional detail.

### P1: Fins

Swimbaits typically have simplified fin representations. Not every fin
needs to be modeled — prioritize the ones that affect swimming action
and visual recognition.

**Pectoral fins (high priority):**
- [ ] Position: behind and below the operculum
- [ ] Size: length as % of body length, width as % of length
- [ ] Angle: how far the fins sweep back from perpendicular
- [ ] Shape: rounded (bluegill), pointed (trout), or paddle (bass)
- [ ] Thickness: thin flat surfaces
- [ ] These are important because they're visible from the front and
      affect the bait's roll/glide behavior in the water

**Dorsal fin (medium priority):**
- [ ] Position: start and end point along dorsal profile (% of SL)
- [ ] Height: peak height above the dorsal profile
- [ ] Shape: triangular (perch), rounded (bluegill), long+low (trout)
- [ ] Spiny vs soft ray distinction (visual only — ridge vs smooth)
- [ ] On swimbaits this is often molded as a low ridge or omitted
      entirely, so it should be optional

**Anal fin (medium priority):**
- [ ] Position: behind the vent, on the ventral side
- [ ] Size and shape: similar controls to dorsal fin
- [ ] Usually small and often omitted on swimbaits

**Pelvic fins (low priority):**
- [ ] Small fins on the ventral side, below the pectoral fins
- [ ] Usually omitted on swimbaits — include as optional detail

**Caudal fin (integrated with tail types):**
- Already handled by the tail geometry system. For hard body baits
  with separate tail fins, this would need its own system, but for
  soft plastics the tail IS the caudal fin equivalent.

### P1: Hook and hardware features

These are critical for a functional bait design — not just cosmetic.

- [ ] **Belly hook slot** — a slit/groove on the ventral surface where
      a belly-mounted treble hook sits. Needs:
  - Position along body (% of SL)
  - Width and depth of the slot
  - Option for hook hanger hole (through-body pin)
  - Current implementation is just a floating box indicator — needs
    to be an actual surface feature / boolean cut

- [ ] **Back hook slot** — for top-hook rigging (like the Tyrant's
      Beast Hook system). A dorsal groove or channel.

- [ ] **Line tie point** — where the line attaches at the nose.
  - Position on the snout (center, top, bottom)
  - Option for through-wire harness channel running full body length
  - Option for screw eye

- [ ] **Weight pocket** — cavity for inserting nail sinkers or tungsten
      weights to control sink rate.
  - Position (usually ventral, forward of center)
  - Size (diameter and depth)
  - Multiple pocket option (for adjustable weighting like the Flag 255)
  - Current implementation is just a floating cylinder indicator

- [ ] **Harness channel** — internal wire harness running nose to tail
      for structural reinforcement and hook mounting. Shown as a
      transparent overlay or cross-section indicator.

- [ ] **Joint cuts** — for multi-segment jointed swimbaits:
  - Number of joints (1, 2, or 3)
  - Joint positions along the body
  - Joint type: hinge (side-to-side) or ball (omni-directional)
  - Joint gap width
  - This is a stretch feature but would be huge for glide bait designers

### P2: Surface details

These are cosmetic features that add realism but don't affect the
functional bait design. Lower priority but high visual impact.

- [ ] **Scale pattern** — procedural texture or bump map. Options:
  - Cycloid (smooth round scales — trout, shad)
  - Ctenoid (rough-edged scales — bass, perch)
  - None (smooth body)
  - Scale size relative to body
  - This would be a texture/normal map, not geometry — too expensive
    to model individual scales as mesh

- [ ] **Lateral line** — visible line from operculum to caudal peduncle
      at the body midline. Could be a subtle groove in the mesh or
      a painted line (texture only).

- [ ] **Gill raker lines** — parallel grooves on the operculum surface.
      Cosmetic detail, low priority.

- [ ] **Fin ray lines** — parallel ridges on fin surfaces indicating
      fin rays. Cosmetic, adds realism especially on dorsal/caudal fins.

### P2: Views and UI

- [ ] **Side profile view** — 2D orthographic view showing dorsal and
      ventral profile curves with draggable control points. This is the
      hull-designer-style interaction where the user shapes the fish
      by dragging spline points on the silhouette.

- [ ] **Top-down plan view** — 2D orthographic view showing the width
      profile with draggable control points.

- [ ] **Cross-section view** — small inset showing the super-ellipse
      cross-section at a user-selected station. Slider to scrub along
      the body length and see how the cross-section changes.

- [ ] **Wireframe toggle** — show the mesh wireframe overlaid on the
      solid surface. Useful for understanding the station/lofting system.

- [ ] **Measurement overlay** — display key dimensions (total length,
      max depth, max width, peduncle depth) as dimension lines on the
      3D model.

- [ ] **Split view** — side-by-side 3D and 2D profile views that
      update simultaneously.

### P2: Export features

- [x] Master STL export (ASCII)
- [ ] **Binary STL export** — much smaller file size for complex meshes.
      ASCII STL of a 96x36 mesh is ~15MB, binary would be ~2MB.
- [ ] **Two-part mold STL export:**
  - Automatic split line at the widest point of each cross-section
  - Registration keys (alignment pins/holes) on the mold halves
  - Pour channel at the tail end
  - Vent holes at the highest points
  - Mold wall thickness parameter
  - Mold exterior shape (rectangular block or conformal shell)
- [ ] **OBJ export** — for users who want to import into Blender/Fusion
      for further refinement
- [ ] **Parameter file export/import** — save/load design as JSON.
      Enables sharing designs, version control, and preset creation.
- [ ] **Screenshot/render export** — high-res PNG of the current view
      for sharing on forums/social media.

### P3: Advanced features (future)

- [ ] **Swim simulation** — basic physics preview showing how the bait
      would move in water based on its shape, weight distribution, and
      tail type. Even a simplified animation of tail kick + body roll
      would be incredibly valuable for designers.

- [ ] **Weight/buoyancy calculator** — based on body volume and material
      density (plastisol ~1.1-1.3 g/cm³), calculate the bait weight
      and whether it floats/sinks/suspends. Factor in hook and hardware
      weight.

- [ ] **User accounts + saved designs** — Cloudflare Workers + KV store.
      Each design gets a unique URL for sharing.

- [ ] **Community gallery** — browse and fork other users' designs.

- [ ] **Builder marketplace** — users can list their designs, others
      can purchase the STL or order a printed mold.

---

## Species preset data

Based on ichthyological morphometric ratios. All values are ratios of
standard length (SL) unless noted.

| Parameter | Shad | Gizzard | Bluegill | Trout | Herring | Perch | Hitch | Minnow |
|-----------|------|---------|----------|-------|---------|-------|-------|--------|
| Length    | 8"   | 7"      | 6"       | 10"   | 9"      | 7"    | 8"    | 5"     |
| BD ratio  | .30  | .36     | .42      | .24   | .26     | .28   | .30   | .20    |
| Width rat | .58  | .65     | .82      | .52   | .46     | .52   | .60   | .48    |
| Girth pos | 34%  | 37%     | 40%      | 31%   | 32%     | 34%   | 36%   | 32%    |
| Head len  | 24%  | 23%     | 27%      | 23%   | 22%     | 26%   | 24%   | 23%    |
| Snout bl  | .48  | .52     | .52      | .35   | .32     | .42   | .45   | .30    |
| Dorsal ar | .15  | .25     | .30      | .15   | .10     | .20   | .16   | .08    |
| Belly ful | .25  | .35     | .35      | .12   | .14     | .18   | .28   | .06    |
| Stalk dep | .22  | .20     | .18      | .26   | .24     | .24   | .20   | .28    |
| Tail type | pad  | pad     | pad      | fork  | fork    | split | fork  | fork   |

---

## Design conventions

- All slider values are normalized ratios (0-1) or percentages, not
  absolute dimensions. The overall length slider sets the scale, everything
  else is proportional.
- Symmetry is always enforced — only the right half is computed, then
  mirrored. User never has to worry about asymmetry.
- Dark UI theme (DM Mono + Instrument Serif fonts, dark surface palette).
  This matches the aesthetic of the swimbait community — these guys
  are not using pastel-colored apps.
- Units are inches throughout. The fishing industry is entirely imperial.
- The 3D preview should feel responsive — geometry rebuilds on every
  slider change. Target: <16ms rebuild time for smooth 60fps feel.
  Current v0.3 achieves this at 96x36 mesh resolution.

## Development workflow

- Claude Code handles all file edits
- Test by opening the HTML file directly in browser (no build step needed)
- Three.js loaded from CDN (cdnjs.cloudflare.com)
- No npm/node dependencies — keep it zero-build
- When ready to deploy: push to Cloudflare Pages repo

## Known issues (v0.3)

1. Head shape is too uniform — needs distinct snout/forehead/cheek geometry
2. Dorsal arch and belly fullness can still create slightly pointed profiles
   at extreme values — the additive offset approach is better than v0.2 but
   the blend curve could be smoother
3. Tail-to-body transition can be abrupt — need better interpolation in
   the 0.78-0.85 range between last body station and tail geometry
4. No mouth, gills, or fins — the three features most needed to make it
   read as a fish
5. Eyes float on the surface instead of sitting in sockets
6. STL export is ASCII (large files) — need binary option
7. No parameter save/load
8. Paddle tail geometry doesn't have a distinct disc shape — looks like
   a body bulge rather than a flat paddle
