import type { Vec3 } from '../types';

export type GeneratorType = 'cycloid' | 'ctenoid' | 'ganoid' | 'micro' | 'fin_rays' | 'lateral_line' | 'skin_bump' | 'smooth';
export type StampType = 'gill_plate' | 'eye_socket' | 'mouth_line' | 'nostril' | 'pectoral_base' | 'vent';
export type FlowDirection = 'head_to_tail' | 'tail_to_head' | 'custom';

export interface TextureZone {
  id: string;
  name: string;
  generator: GeneratorType;
  params: Record<string, number>;
  vertexMask: number[];
  depthOverride: number;
}

export interface Stamp {
  id: string;
  type: StampType;
  position: Vec3;
  rotation: number;
  scale: number;
  mirror: boolean;
  params: Record<string, number>;
}

export interface TextureConfig {
  enabled: boolean;
  globalDepthScale: number;
  zoneFeather: number;
  partingSuppress: number;
  flowDirection: FlowDirection;
  zones: TextureZone[];
  stamps: Stamp[];
}
