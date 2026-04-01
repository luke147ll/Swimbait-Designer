/**
 * @file tails.js
 * Tail geometry generators — paddle, wedge, boot, split, fork profile functions.
 * Called by engine.js genBody() for stations beyond the tail-start threshold.
 */

/**
 * Compute tail cross-section half-height and half-width at parametric position lt.
 * Height scales from peduncle (stalk continuity), width blends from peduncle
 * at the base to body-scale at the disc/fin so the tail is visually proportional.
 * @param {string} tailType - one of 'paddle','wedge','boot','split','fork'
 * @param {number} lt - local parametric position within the tail (0 = base, 1 = tip)
 * @param {number} pedD - peduncle depth (full)
 * @param {number} pedW - peduncle width (full)
 * @param {number} maxD - maximum body depth
 * @param {number} maxW - maximum body width
 * @param {number} ts - tail size multiplier
 * @param {number} tt - tail thickness multiplier
 * @returns {{th: number, tw: number}}
 */
export function generateTailSection(tailType, lt, pedD, pedW, maxD, maxW, ts, tt) {
  let th, tw;
  if (tailType === 'paddle') {
    // Lollipop paddle: thin round stalk + flat vertical disc
    // Think: thin cylindrical stick with a flat round lollipop on the end
    const STALK_END = 0.55;   // stalk is first 55% of tail
    const DISC_START = 0.60;  // disc begins at 60%

    // Stalk: thin cylinder, nearly round, tapers slightly
    const stalkR = pedD * 0.08;
    // Disc: tall vertical oval, very thin laterally
    const discH = maxD * 0.30 * ts;

    if (lt <= STALK_END) {
      // Thin round stalk — gentle taper from peduncle to stalk radius
      const sp = lt / STALK_END;
      const r = pedD * 0.5 * (1 - sp) + stalkR * sp; // linear blend
      th = r;
      tw = r * 0.90; // nearly round
    } else if (lt <= DISC_START) {
      // Quick transition from stalk to disc edge
      const tp = (lt - STALK_END) / (DISC_START - STALK_END);
      const s = tp * tp * (3 - 2 * tp); // smoothstep
      const discEdge = discH * 0.35;
      th = stalkR + (discEdge - stalkR) * s;
      tw = stalkR * 0.90 * (1 - s) + discEdge * tt * 0.15 * s;
    } else {
      // Flat vertical disc — sine swell in height, very thin
      const dp = (lt - DISC_START) / (1.0 - DISC_START);
      const swell = Math.sin(dp * Math.PI);
      th = discH * (0.35 + swell * 0.65);
      tw = th * tt * 0.15; // disc thickness ~8% of height at default tt
    }
  } else if (tailType === 'wedge') {
    const taper = Math.pow(1 - lt * 0.6, 0.7);
    th = (pedD * 0.5 + maxD * 0.15 * ts) * taper;
    tw = (pedW * 0.5 + maxW * 0.10 * ts) * tt * (0.8 - lt * 0.5);
  } else if (tailType === 'boot') {
    const thin = lt < 0.5 ? 1 - lt * 1.2 : 0.4;
    const kick = lt > 0.5 ? Math.pow((lt - 0.5) / 0.5, 1.5) * ts : 0;
    th = pedD * 0.5 * (thin + kick * 2.5);
    tw = (pedW * 0.5 + maxW * 0.15 * kick) * tt * (1 - lt * 0.2);
  } else if (tailType === 'split') {
    const pinch = 1 - Math.pow(Math.sin(lt * Math.PI), 0.5) * 0.5;
    const taper = 1 - lt * 0.2;
    th = (pedD * 0.5 + maxD * 0.12 * ts) * pinch * taper;
    tw = (pedW * 0.5 + maxW * 0.08 * ts) * tt * (0.7 - lt * 0.4);
  } else { // fork
    const spread = lt * 0.8;
    const taper = Math.pow(1 - lt, 0.5);
    th = (pedD * 0.5 + maxD * 0.10 * ts) * taper;
    tw = (pedW * 0.5 + maxW * 0.10 * ts) * tt * (0.3 + spread * 0.4);
  }
  return { th, tw };
}
