/**
 * @file presets.js
 * Species preset parameter sets and preset-loading logic.
 */

export const PRESETS = {
  shad:    {OL:8,  BD:.30,WR:.58,GP:.34,HL:.24,SB:.48,HW:.82,DA:.15,BF:.25,BT:.55,CS:2.15,SL:.14,SD:.22,SC:.55,TS:.80,TT:.55,ES:.55,EB:.30,HS:.40,WP:.25,t:'paddle'},
  gizzard: {OL:7,  BD:.36,WR:.65,GP:.37,HL:.23,SB:.52,HW:.88,DA:.25,BF:.35,BT:.50,CS:2.2,SL:.13,SD:.20,SC:.50,TS:.80,TT:.50,ES:.58,EB:.25,HS:.40,WP:.30,t:'paddle'},
  gill:    {OL:6,  BD:.42,WR:.82,GP:.40,HL:.27,SB:.52,HW:.90,DA:.30,BF:.35,BT:.48,CS:2.05,SL:.11,SD:.18,SC:.48,TS:.65,TT:.45,ES:.62,EB:.35,HS:.42,WP:.30,t:'paddle'},
  trout:   {OL:10, BD:.24,WR:.52,GP:.31,HL:.23,SB:.35,HW:.78,DA:.15,BF:.12,BT:.58,CS:2.1,SL:.16,SD:.26,SC:.55,TS:.55,TT:.45,ES:.42,EB:.20,HS:.35,WP:.22,t:'fork'},
  herring: {OL:9,  BD:.26,WR:.46,GP:.32,HL:.22,SB:.32,HW:.76,DA:.10,BF:.14,BT:.58,CS:2.05,SL:.15,SD:.24,SC:.50,TS:.55,TT:.40,ES:.42,EB:.20,HS:.35,WP:.20,t:'fork'},
  perch:   {OL:7,  BD:.28,WR:.52,GP:.34,HL:.26,SB:.42,HW:.80,DA:.20,BF:.18,BT:.55,CS:2.15,SL:.14,SD:.24,SC:.52,TS:.65,TT:.48,ES:.50,EB:.30,HS:.38,WP:.25,t:'split'},
  hitch:   {OL:8,  BD:.30,WR:.60,GP:.36,HL:.24,SB:.45,HW:.84,DA:.16,BF:.28,BT:.52,CS:2.15,SL:.13,SD:.20,SC:.52,TS:.72,TT:.50,ES:.52,EB:.25,HS:.38,WP:.28,t:'fork'},
  minnow:  {OL:5,  BD:.20,WR:.48,GP:.32,HL:.23,SB:.30,HW:.76,DA:.08,BF:.06,BT:.60,CS:2.0,SL:.16,SD:.28,SC:.58,TS:.50,TT:.40,ES:.48,EB:.20,HS:.30,WP:.15,t:'fork'}
};

const SLIDER_MAP = {
  OL:'sOL',BD:'sBD',WR:'sWR',GP:'sGP',HL:'sHL',SB:'sSB',HW:'sHW',
  DA:'sDA',BF:'sBF',BT:'sBT',CS:'sCS',SL:'sSL',SD:'sSD',SC:'sSC',
  TS:'sTS',TT:'sTT',ES:'sES',EB:'sEB',HS:'sHS',WP:'sWP',
};

/**
 * Apply a named preset to the DOM sliders.
 * @param {string} name - preset key
 * @returns {string|null} tail type string, or null if preset not found
 */
export function loadPreset(name) {
  const pr = PRESETS[name];
  if (!pr) return null;
  for (const [k, id] of Object.entries(SLIDER_MAP)) {
    const el = document.getElementById(id);
    if (el) el.value = pr[k];
  }
  return pr.t;
}
