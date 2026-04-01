# Swimbait Designer — Parametric Specification
## Cross-referencing fish morphology + hull design methodology

---

## The core insight from hull design

Hull design software (DELFTship, FREE!ship, PolyCAD, Carlson Hull Designer) all use
the same fundamental approach: **station-based lofting**. You define a series of
cross-section profiles (called "stations") at intervals along the length, then
the software skins a smooth surface between them using subdivision surfaces or
NURBS interpolation.

This is exactly how a fish body works. Ichthyologists measure fish at standard
stations (snout, eye, operculum, pectoral, max depth, vent, caudal peduncle,
tail base) and the shape between those stations is a smooth interpolated surface.

**The swimbait designer should work the same way: the user defines 8-10 station
profiles along the body, and a lofting algorithm skins between them.**

Each station is an ellipse-like cross-section defined by:
- Height (dorsal-ventral dimension)
- Width (lateral dimension)
- Vertical center offset (how far the centerline drops — belly sag)
- Dorsal curvature (how peaked vs flat the back is)
- Ventral curvature (how rounded vs flat the belly is)
- Asymmetry (dorsal vs ventral radius ratio)

The user doesn't manually set each station. Instead, they control high-level
parameters (like "belly fullness" or "head bluntness") and the system
distributes those across the stations parametrically.

---

## Fish morphometric parameters (from ichthyology)

Standard measurements used in fish taxonomy, mapped to swimbait designer controls:

### Length measurements (along the body axis)
| Measurement              | Ichthyology term          | Designer parameter          |
|--------------------------|---------------------------|-----------------------------|
| Total length             | TL                        | Overall length (user input) |
| Standard length          | SL (snout to tail base)   | Body length (before tail)   |
| Head length              | HL (snout to operculum)   | Head length %               |
| Pre-dorsal length        | PDL (snout to dorsal fin) | Dorsal peak position %      |
| Pre-orbital length       | Snout length              | Snout length %              |
| Caudal peduncle length   | CPL                       | Stalk length %              |

### Depth measurements (vertical, perpendicular to body axis)
| Measurement                     | Station location      | Designer parameter        |
|---------------------------------|-----------------------|---------------------------|
| Head depth at eye               | ~10-15% SL            | Head depth                |
| Maximum body depth              | ~30-45% SL            | Max girth + girth position|
| Depth at dorsal fin origin      | ~35-50% SL            | Dorsal arch height        |
| Depth at anal fin origin        | ~55-70% SL            | Rear body depth           |
| Least depth at caudal peduncle  | ~80-90% SL            | Stalk thickness           |

### Width measurements (lateral)
| Measurement             | Station location   | Designer parameter       |
|-------------------------|--------------------|--------------------------|
| Maximum head width      | ~8-12% SL          | Head width ratio         |
| Maximum body width      | ~30-45% SL         | Body width ratio         |
| Width at caudal peduncle| ~85% SL            | Stalk width ratio        |

### Feature positions
| Feature          | Ichthyology landmark   | Designer parameter          |
|------------------|------------------------|-----------------------------|
| Eye position     | Orbital center         | Eye position % + eye size   |
| Mouth position   | Premaxilla             | Mouth width + gape angle    |
| Gill plate       | Operculum edge         | Head/body transition point  |
| Lateral line     | Lateral line canal      | (visual only — decoration)  |
| Dorsal fin base  | Dorsal fin origin/end  | Dorsal fin position/size    |
| Anal fin base    | Anal fin origin/end    | (future feature)            |
| Pectoral fin     | Pectoral base          | Pectoral fin position/size  |

---

## Station layout (8 control stations)

Based on both fish anatomy and hull design practice, these are the key stations:

```
Station 0: Nose tip (t=0.00)
  - Point only (converges to zero radius)
  - Controlled by: snout bluntness (sharp vs rounded)

Station 1: Eye / mid-head (t=0.08-0.12)
  - Height: head depth
  - Width: head width  
  - Shape: slightly taller than wide, flattened sides
  - Controlled by: head depth, head width ratio
  - Eye placed here

Station 2: Operculum / gill plate (t=0.18-0.25)
  - Height: near-max or max depth depending on species
  - Width: near-max width
  - Shape: transition from head to body
  - Controlled by: head length %, gill flare
  - This is where the "shoulder" happens on shad/bluegill

Station 3: Maximum girth (t=0.30-0.50, user-adjustable)
  - Height: maximum body depth
  - Width: maximum body width
  - Shape: fullest cross-section
  - Controlled by: max girth, width ratio, girth position
  - Belly drop maximizes here
  - Dorsal peak may be here or slightly behind

Station 4: Mid-body / dorsal fin region (t=0.45-0.55)
  - Height: slightly less than max, beginning taper
  - Width: beginning to narrow
  - Shape: body starting to taper toward tail
  - Controlled by: body taper rate

Station 5: Vent / rear body (t=0.60-0.70)
  - Height: noticeable reduction from max
  - Width: narrowing
  - Shape: the body is clearly tapering
  - Controlled by: rear body fullness
  - Anal fin / hook slot located here

Station 6: Caudal peduncle (t=0.78-0.85)
  - Height: minimum body depth (the "waist" before the tail)
  - Width: minimum body width
  - Shape: compressed oval — typically taller than wide
  - Controlled by: stalk thickness, stalk compression ratio
  - THIS IS THE KEY STATION — it's what separates a fish
    from a torpedo. The dramatic narrowing here creates
    the "waist" that makes the shape read as a fish.

Station 7: Tail base / caudal fin root (t=0.85-0.90)
  - Height: begins to expand again (tail swell)
  - Width: very thin (the tail is a flat paddle/wedge)
  - Shape: vertically elongated, very compressed laterally
  - Controlled by: tail type, tail size

Station 8: Tail tip (t=1.00)
  - Shape depends entirely on tail type:
    - Paddle: wide, thin, rounded terminus
    - Wedge: gradual thinning to a blunt edge
    - Boot: thin stalk then flared kick
    - Split: two thin lobes diverging
    - Fork: V-shaped (for hard body glide baits)
```

---

## Key design curves (from hull design methodology)

Hull designers think in terms of four fundamental curves that define a vessel:

1. **Sheerline** (top profile) → maps to the DORSAL PROFILE of the fish
   - Side view, top edge: snout rise → dorsal peak → tail descent
   - Controlled by: head bluntness, dorsal arch, dorsal peak position

2. **Keel line** (bottom profile) → maps to the VENTRAL PROFILE
   - Side view, bottom edge: chin → belly drop → anal region → stalk
   - Controlled by: belly fullness, belly drop position, stalk depth

3. **Deck plan** (top-down outline) → maps to the PLAN VIEW
   - Top view: snout width → max width → tail taper
   - Controlled by: head width, max width position, width taper rate

4. **Station curves** (cross-sections) → maps to BODY CROSS-SECTIONS
   - The shape of the body at each station
   - Controlled by: dorsal-ventral asymmetry, lateral compression

### The four curves the user should be able to edit:

**Dorsal profile curve** (side view, top edge)
- Points: nose tip, forehead, dorsal peak, rear slope, stalk top, tail top
- Controls the "silhouette" — this is what fishermen recognize first

**Ventral profile curve** (side view, bottom edge)  
- Points: chin, throat, belly deepest point, anal region, stalk bottom
- Controls belly fullness and the characteristic sag of a baitfish

**Plan curve** (top-down half-width)
- Points: snout width, cheek width, max width, rear taper, stalk width
- Controls whether the fish is wide/flat (bluegill) or narrow (trout)

**Cross-section shape** (adjustable per-station)
- Super-ellipse exponent: 2.0 = true ellipse, >2.0 = more rectangular/boxy,
  <2.0 = more diamond/pinched
- Dorsal-ventral asymmetry: ratio of top radius to bottom radius
- This is the subtlest control but the most powerful — it's what makes
  a bluegill cross-section (nearly circular) look different from a
  shad cross-section (tall and compressed)

---

## Recommended UI approach

Based on hull design software patterns (especially Carlson Hull Designer and
DELFTship which are praised for simplicity):

### Primary view: Side profile with draggable spline points
- Show the dorsal and ventral profile curves
- User drags control points to reshape the silhouette
- This is the most intuitive interaction — "draw the fish shape"

### Secondary view: Top-down plan
- Show the plan curve (half-width outline)
- User drags to adjust width distribution

### 3D preview: Live-updating lofted surface
- Continuously regenerates as the user adjusts any curve or slider
- Orbit/zoom controls

### Slider panel: Quick adjustments
These map to the spline control points but are more accessible:

**Body sliders:**
- Overall length (4-14")
- Max girth (body depth at widest point)
- Girth position (where the widest point falls, as % of body length)
- Body width ratio (width relative to depth)
- Head length (% of body)
- Head bluntness (snout radius)
- Belly fullness (how much the belly sags below centerline)
- Dorsal arch (how much the back humps above centerline)
- Body taper rate (how quickly the body narrows behind max girth)

**Caudal peduncle sliders:**
- Stalk length (how long the narrow section is)
- Stalk thickness (minimum depth at the peduncle)
- Stalk compression (height-to-width ratio at the peduncle)

**Tail sliders:**
- Tail type (paddle/wedge/boot/split/fork)
- Tail size (how big the tail is relative to body)
- Tail thickness (how flat/thick the tail paddle is)
- Tail angle (for boot tail — kick angle)

**Feature sliders:**
- Eye size and position
- Mouth gape
- Hook slot depth and position
- Weight pocket size and position
- Gill slit position (visual)

---

## Species-specific preset ratios

From ichthyological data, key ratios that differentiate common forage species:

| Species         | Body depth/SL | Head/SL | Max girth pos | Peduncle/depth | Width ratio |
|-----------------|---------------|---------|---------------|----------------|-------------|
| Threadfin shad  | 0.30-0.35     | 0.24    | 30-35%        | 0.20-0.25      | 0.55-0.65   |
| Gizzard shad    | 0.35-0.42     | 0.22    | 35-40%        | 0.18-0.22      | 0.60-0.70   |
| Bluegill        | 0.45-0.55     | 0.28    | 38-45%        | 0.15-0.18      | 0.80-0.95   |
| Rainbow trout   | 0.22-0.28     | 0.23    | 28-33%        | 0.25-0.30      | 0.50-0.60   |
| Largemouth bass | 0.30-0.38     | 0.30    | 32-38%        | 0.22-0.28      | 0.55-0.65   |
| Yellow perch    | 0.25-0.30     | 0.26    | 30-35%        | 0.22-0.26      | 0.50-0.58   |
| Herring/alewife | 0.25-0.30     | 0.22    | 30-35%        | 0.20-0.25      | 0.45-0.55   |
| Hitch           | 0.28-0.35     | 0.24    | 35-40%        | 0.18-0.22      | 0.55-0.65   |

These ratios become presets — when the user clicks "Bluegill" the system loads
a body depth/SL of 0.50, a girth position of 42%, a peduncle ratio of 0.16,
and a width ratio of 0.88.

---

## Lofting algorithm (from hull design)

The recommended approach, borrowed directly from DELFTship/FREE!ship:

1. Define the station cross-sections as parametric super-ellipses
2. Position them along the body axis at the station points
3. Use Catmull-Rom or cubic B-spline interpolation between stations
4. Generate a triangle mesh by sampling the interpolated surface

**Super-ellipse formula for cross-sections:**
```
(|x|/a)^n + (|y|/b)^n = 1
```
Where:
- a = half-width at this station
- b = half-height at this station  
- n = shape exponent (2.0=ellipse, 2.5=slightly rectangular, 3.0=rounded rect)
- Dorsal and ventral can use different b values (asymmetric)

This is significantly better than the current circular cross-section approach
because it allows the body to be boxy (bluegill), teardrop (shad), or
compressed (trout) at each station independently.

**Catmull-Rom interpolation between stations:**
```javascript
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2*p0 - 5*p1 + 4*p2 - p3) * t2 +
    (-p0 + 3*p1 - 3*p2 + p3) * t3
  );
}
```

This gives smooth, continuous curves between stations with no hard transitions
— exactly what hull designers use and exactly what a fish body needs.

---

## Implementation priority

### v0.3 (next iteration):
- [ ] Implement 8-station system with super-ellipse cross-sections
- [ ] Catmull-Rom interpolation between stations
- [ ] Separate dorsal/ventral profile controls
- [ ] Proper caudal peduncle (dramatic narrowing)
- [ ] Real tail geometry (paddle as a flattened oval, not a tapered body)
- [ ] Species presets from the ratio table above

### v0.4:
- [ ] Draggable spline points on side/top profile views
- [ ] Per-station cross-section shape control (super-ellipse exponent)
- [ ] Gill slit visual indicator
- [ ] Pectoral fin stub geometry

### v0.5:
- [ ] Automatic mold split line generation
- [ ] Pour channel and vent hole placement
- [ ] Two-part mold STL export
- [ ] Hook harness channel option

---

## Key references

**Fish morphology:**
- Standard ichthyometric measurements (31 standard parameters)
- Key measurements: SL, HL, BD, ED, CPL, peduncle height, max body width

**Hull design methodology:**
- Station-based lofting (DELFTship, FREE!ship, PolyCAD)
- Catmull-Rom spline interpolation between stations
- Four fundamental curves: sheer, keel, deck plan, stations
- Super-ellipse cross-sections for variable body shape
- Subdivision surfaces for smooth mesh generation

**Software references:**
- DELFTship (free hull modeler, subdivision surfaces)
- Carlson Hull Designer (simple interactive 3D, praised for fast iteration)
- Bearboat SP (parametric kayak designer — closest UI analogy to what we want)
- WellingLures LureBuilder (existing lure tool, hard body focus only)
