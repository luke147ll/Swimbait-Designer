/**
 * Watermark — blocky pixel-font text subtracted as voids from mold outer faces.
 * Half A gets "SWIMBAIT", Half B gets "DESIGNER".
 * Letters scale to fit the mold face width with margin.
 */
import { mBox, mTranslate, mBatchUnion, mSubtract, type ManifoldSolid } from '../csg';

// Each letter: array of [x, y, w, h] strokes on a 4×6 unit grid (1 unit stroke width)
const PIXEL_FONT: Record<string, number[][]> = {
  S: [[0,0,4,1],[0,0,1,3],[0,2.5,4,1],[3,2.5,1,3],[0,5,4,1]],
  W: [[0,0,1,6],[2,2,1,4],[4,0,1,6],[1,4.5,1,1.5],[3,4.5,1,1.5]],
  I: [[0,0,1,6]],
  M: [[0,0,1,6],[1,1,1,1],[2,2,1,1],[3,1,1,1],[4,0,1,6]],
  B: [[0,0,1,6],[0,0,4,1],[0,2.5,4,1],[0,5,4,1],[3,0,1,3.5],[3,2.5,1,3.5]],
  A: [[0,0,4,1],[0,0,1,6],[3,0,1,6],[0,2.5,4,1]],
  T: [[0,0,4,1],[1.5,0,1,6]],
  D: [[0,0,1,6],[0,0,3,1],[0,5,3,1],[3,1,1,4]],
  E: [[0,0,1,6],[0,0,4,1],[0,2.5,3,1],[0,5,4,1]],
  G: [[0,0,4,1],[0,0,1,6],[0,5,4,1],[3,3,1,3],[2,3,2,1]],
  N: [[0,0,1,6],[1,1,1,1],[2,2,1,1],[3,3,1,1],[4,0,1,6]],
  R: [[0,0,1,6],[0,0,4,1],[0,2.5,4,1],[3,0,1,3.5],[2.5,3.5,1,1],[3,4.5,1,1.5]],
};

const LETTER_WIDTHS: Record<string, number> = {
  S:4, W:5, I:1, M:5, B:4, A:4, T:4, D:4, E:4, G:4, N:5, R:4,
};

const LETTER_SPACING = 1.5;

function calculateScale(text: string, availW: number, availH: number) {
  const letters = text.split('');
  let totalGridW = 0;
  for (const l of letters) totalGridW += LETTER_WIDTHS[l] || 4;
  totalGridW += (letters.length - 1) * LETTER_SPACING;
  const gridH = 6;

  const byWidth = availW / totalGridW;
  const byHeight = availH * 0.3 / gridH;
  const unitSize = Math.max(Math.min(byWidth, byHeight), 0.6);

  return { unitSize, totalW: totalGridW * unitSize, totalH: gridH * unitSize };
}

function buildTextSolid(
  text: string, unitSize: number, totalW: number, totalH: number, depth: number,
): ManifoldSolid {
  let cursorX = -totalW / 2;
  const startY = -totalH / 2;
  const strokes: ManifoldSolid[] = [];

  for (const letter of text.split('')) {
    const def = PIXEL_FONT[letter];
    if (!def) { cursorX += ((LETTER_WIDTHS[letter] || 4) + LETTER_SPACING) * unitSize; continue; }

    for (const [gx, gy, gw, gh] of def) {
      const sx = cursorX + gx * unitSize;
      const sy = startY + gy * unitSize;
      strokes.push(mTranslate(mBox(gw * unitSize, gh * unitSize, depth), sx + gw * unitSize / 2, sy + gh * unitSize / 2, 0));
    }

    cursorX += ((LETTER_WIDTHS[letter] || 4) + LETTER_SPACING) * unitSize;
  }

  return mBatchUnion(strokes);
}

/**
 * Subtract watermark text from mold halves.
 * Half A outer face is at -Z (text: "SWIMBAIT").
 * Half B outer face is at +Z (text: "DESIGNER").
 *
 * Mold coords: X=bait length, Y=bait height, Z=width (parting at Z=0).
 * Text runs along X, letters stack in Y.
 * Voids cut into Z from the outer face inward.
 */
export function applyWatermarks(
  halfA: ManifoldSolid,
  halfB: ManifoldSolid | null,
  moldLenX: number,
  moldHtY: number,
  halfZ: number,
  depth: number = 1.5,
): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
  const margin = 10;
  const availW = moldLenX - margin * 2;
  const availH = moldHtY - margin * 2;

  // Half A: "SWIMBAIT" on the -Z face
  {
    const { unitSize, totalW, totalH } = calculateScale('SWIMBAIT', availW, availH);
    console.log(`[Watermark] "SWIMBAIT" — unit: ${unitSize.toFixed(2)}mm, size: ${totalW.toFixed(1)}×${totalH.toFixed(1)}mm`);
    const text = buildTextSolid('SWIMBAIT', unitSize, totalW, totalH, depth);
    // Position at -Z outer face, voids cut inward (+Z direction)
    const positioned = text.translate([0, 0, -halfZ + depth / 2]);
    halfA = mSubtract(halfA, positioned);
  }

  // Half B: "DESIGNER" on the +Z face
  if (halfB) {
    const { unitSize, totalW, totalH } = calculateScale('DESIGNER', availW, availH);
    console.log(`[Watermark] "DESIGNER" — unit: ${unitSize.toFixed(2)}mm, size: ${totalW.toFixed(1)}×${totalH.toFixed(1)}mm`);
    const text = buildTextSolid('DESIGNER', unitSize, totalW, totalH, depth);
    // Position at +Z outer face, voids cut inward (-Z direction)
    const positioned = text.translate([0, 0, halfZ - depth / 2]);
    halfB = mSubtract(halfB, positioned);
  }

  return { halfA, halfB };
}
