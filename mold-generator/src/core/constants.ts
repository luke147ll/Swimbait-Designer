import type { MoldConfig, AlignmentConfig, ClampConfig, SprueConfig, VentConfig, PrinterProfile, BoltSize } from './types';

export const PRINTER_PROFILES: PrinterProfile[] = [
  { id: 'bambu_a1_mini', name: 'Bambu Lab A1 Mini', bedX: 180, bedY: 180, bedZ: 180, usableX: 175, usableY: 175, usableZ: 175, isCustom: false },
  { id: 'bambu_a1', name: 'Bambu Lab A1', bedX: 256, bedY: 256, bedZ: 256, usableX: 250, usableY: 250, usableZ: 250, isCustom: false },
  { id: 'bambu_x1c', name: 'Bambu Lab X1C / P1S', bedX: 256, bedY: 256, bedZ: 256, usableX: 250, usableY: 236, usableZ: 250, isCustom: false },
  { id: 'prusa_mk4s', name: 'Prusa MK4S', bedX: 250, bedY: 210, bedZ: 220, usableX: 245, usableY: 205, usableZ: 215, isCustom: false },
  { id: 'prusa_core_one', name: 'Prusa Core One', bedX: 250, bedY: 220, bedZ: 270, usableX: 245, usableY: 215, usableZ: 265, isCustom: false },
  { id: 'ender_3_v3', name: 'Creality Ender 3 V3', bedX: 220, bedY: 220, bedZ: 250, usableX: 215, usableY: 215, usableZ: 245, isCustom: false },
  { id: 'k1_max', name: 'Creality K1 Max', bedX: 300, bedY: 300, bedZ: 300, usableX: 295, usableY: 295, usableZ: 295, isCustom: false },
  { id: 'elegoo_neptune4_pro', name: 'Elegoo Neptune 4 Pro', bedX: 225, bedY: 225, bedZ: 265, usableX: 220, usableY: 220, usableZ: 260, isCustom: false },
];

export const INJECTOR_PRESETS = {
  standard_5_8: { name: 'Standard 5/8" Hand Injector', entryDiameter: 16.2, boreDiameter: 10.0, taper: 2, compatibility: 'Do-It, Basstackle, Baitmold, CooB, and all standard 5/8" (16mm) hand injectors' },
  jacobs_press: { name: 'Jacobs Injection Press', entryDiameter: 16.2, boreDiameter: 10.0, taper: 2, compatibility: 'Jacobs Mold & Machine Pro Series and Standard Series injection presses' },
  open_pour: { name: 'Open Pour (No Injector)', entryDiameter: 0, boreDiameter: 12.0, taper: 0, compatibility: 'Hand pour from Pyrex cup. Single-sided mold with exposed cavity.' },
} as const;

export const HEAT_SET_INSERT_HOLES: Record<BoltSize, { holeDiameter: number; depth: number }> = {
  M4: { holeDiameter: 5.3, depth: 8 },
  M5: { holeDiameter: 6.4, depth: 8 },
  M6: { holeDiameter: 7.6, depth: 8 },
};

export const BOLT_CLEARANCE_HOLES: Record<BoltSize, { clearanceDiameter: number; headDiameter: number; countersinkDepth: number }> = {
  M4: { clearanceDiameter: 4.5, headDiameter: 8, countersinkDepth: 3 },
  M5: { clearanceDiameter: 5.5, headDiameter: 10, countersinkDepth: 3 },
  M6: { clearanceDiameter: 6.5, headDiameter: 11, countersinkDepth: 3.5 },
};

export const DEFAULT_MOLD_CONFIG: MoldConfig = {
  wallMarginX: 8, wallMarginY: 8, wallMarginZ: 6, clampFlange: 12,
  partingFaceDepth: 2, cavityClearance: 0.15, draftAngle: 2, cornerRadius: 3,
};

export const DEFAULT_ALIGNMENT_CONFIG: AlignmentConfig = {
  type: 'dowel_pin', pinDiameter: 4, pinLength: 16, pinCount: 2,
  pressClearance: -0.1, slipClearance: 0.15, positions: [],
  perimeterKey: true, keyHeight: 0.8,
};

export const DEFAULT_CLAMP_CONFIG: ClampConfig = {
  mode: 'heat_set_insert', boltSize: 'M5', boltCount: 4, positions: [],
};

export const DEFAULT_SPRUE_CONFIG: SprueConfig = {
  preset: 'standard_5_8', entryDiameter: 16.2, boreDiameter: 10,
  taper: 2, position: 'tail', positionVec: null, gateType: 'direct', offsetZ: 0,
};

export const DEFAULT_VENT_CONFIG: VentConfig = {
  autoVent: true, ventWidth: 2.0, ventDepth: 0.3, vents: [],
};
