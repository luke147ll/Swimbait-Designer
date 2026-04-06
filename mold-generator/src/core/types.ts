import * as THREE from 'three';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SlotConfig {
  width: number;
  length: number;
  depth: 'through' | number;
  positionX: number;
  positionY: number;
  positionZ: number;
}

export interface InsertCard {
  label: string;
  geometry: THREE.BufferGeometry;
}

export interface MoldConfig {
  wallMarginX: number;
  wallMarginY: number;
  wallMarginZ: number;
  clampFlange: number;
  partingFaceDepth: number;
  cavityClearance: number;
  draftAngle: number;
  cornerRadius: number;
}

export type AlignmentType = 'dowel_pin' | 'printed_pin';

export interface AlignmentConfig {
  type: AlignmentType;
  pinDiameter: number;
  pinLength: number;
  pinCount: number;
  pressClearance: number;
  slipClearance: number;
  positions: Vec3[];
  perimeterKey: boolean;
  keyHeight: number;
}

export type ClampMode = 'heat_set_insert' | 'through_bolt' | 'external_clamp';
export type BoltSize = 'M4' | 'M5' | 'M6';

export interface ClampConfig {
  mode: ClampMode;
  boltSize: BoltSize;
  boltCount: number;
  positions: Vec3[];
}

export type SpruePreset = 'standard_5_8' | 'jacobs_press' | 'open_pour' | 'custom';
export type GateType = 'direct' | 'pinch' | 'fan';
export type SpruePosition = 'tail' | 'head' | 'side';

export interface SprueConfig {
  preset: SpruePreset;
  entryDiameter: number;
  boreDiameter: number;
  taper: number;
  position: SpruePosition;
  positionVec: Vec3 | null;
  gateType: GateType;
  offsetZ: number;
}

export interface Vent {
  id: string;
  position: Vec3;
  direction: Vec3;
}

export interface VentConfig {
  autoVent: boolean;
  ventWidth: number;
  ventDepth: number;
  vents: Vent[];
}

export interface PrinterProfile {
  id: string;
  name: string;
  bedX: number;
  bedY: number;
  bedZ: number;
  usableX: number;
  usableY: number;
  usableZ: number;
  isCustom: boolean;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationError {
  code: string;
  severity: ValidationSeverity;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  suggestions: string[];
  canPrintBothOnOneBed: boolean;
}

export interface MeshValidationResult {
  valid: boolean;
  issues: ValidationError[];
  vertexCount: number;
  isManifold: boolean;
  hasConsistentNormals: boolean;
}

export interface BOMItem {
  name: string;
  quantity: number;
  size: string;
  material: string;
  notes?: string;
}

export interface BillOfMaterials {
  items: BOMItem[];
  estimatedFilamentGrams: number;
  estimatedFilamentMeters: number;
  recommendedMaterial: string;
  recommendedPrintSettings: {
    layerHeight: string;
    wallCount: string;
    infill: string;
    infillPattern: string;
    orientation: string;
  };
}

// Import texture types
import type { TextureConfig } from './texture/types';

export interface MoldState {
  baitMesh: THREE.BufferGeometry | null;
  baitFileName: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baitManifold: any | null;
  moldConfig: MoldConfig;
  alignmentConfig: AlignmentConfig;
  clampConfig: ClampConfig;
  sprueConfig: SprueConfig;
  ventConfig: VentConfig;
  printerProfile: PrinterProfile;
  textureConfig: TextureConfig | null;
  texturedBaitMesh: THREE.BufferGeometry | null;
  moldHalfA: THREE.BufferGeometry | null;
  moldHalfB: THREE.BufferGeometry | null;
  slotConfigs: SlotConfig[];
  insertCards: InsertCard[];
  validationResult: ValidationResult | null;
  isGenerating: boolean;
  lastGeneratedAt: number | null;
  setBaitMesh: (mesh: THREE.BufferGeometry, fileName: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setBaitManifold: (manifold: any | null) => void;
  updateMoldConfig: (partial: Partial<MoldConfig>) => void;
  updateAlignmentConfig: (partial: Partial<AlignmentConfig>) => void;
  updateClampConfig: (partial: Partial<ClampConfig>) => void;
  updateSprueConfig: (partial: Partial<SprueConfig>) => void;
  updateVentConfig: (partial: Partial<VentConfig>) => void;
  setPrinterProfile: (profile: PrinterProfile) => void;
  setGeneratedMold: (halfA: THREE.BufferGeometry, halfB: THREE.BufferGeometry | null) => void;
  setValidationResult: (result: ValidationResult) => void;
  setIsGenerating: (generating: boolean) => void;
  setTexturedBaitMesh: (mesh: THREE.BufferGeometry | null) => void;
  setTextureConfig: (config: TextureConfig | null) => void;
  setSlotConfigs: (configs: SlotConfig[]) => void;
  setInsertCards: (cards: InsertCard[]) => void;
  resetToDefaults: () => void;
}

export interface MoldResult {
  halfA: THREE.BufferGeometry;
  halfB: THREE.BufferGeometry | null;
  validation: ValidationResult;
  bom: BillOfMaterials | null;
  generationTimeMs: number;
}
