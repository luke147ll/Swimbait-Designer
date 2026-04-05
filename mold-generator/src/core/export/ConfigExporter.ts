import type { MoldState } from '../types';

export class ConfigExporter {
  exportConfig(state: Partial<MoldState>): string {
    const config = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      generator: 'SBD Mold Generator',
      baitFileName: state.baitFileName ?? null,
      moldConfig: state.moldConfig,
      alignmentConfig: state.alignmentConfig,
      clampConfig: state.clampConfig,
      sprueConfig: state.sprueConfig,
      ventConfig: state.ventConfig,
      printerProfile: state.printerProfile,
      textureConfig: state.textureConfig ?? null,
    };
    return JSON.stringify(config, null, 2);
  }

  importConfig(json: string): Partial<MoldState> | null {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.version) return null;
      return {
        moldConfig: parsed.moldConfig ?? undefined,
        alignmentConfig: parsed.alignmentConfig ?? undefined,
        clampConfig: parsed.clampConfig ?? undefined,
        sprueConfig: parsed.sprueConfig ?? undefined,
        ventConfig: parsed.ventConfig ?? undefined,
        printerProfile: parsed.printerProfile ?? undefined,
        textureConfig: parsed.textureConfig ?? undefined,
      };
    } catch {
      return null;
    }
  }

  downloadConfig(state: Partial<MoldState>): void {
    const json = this.exportConfig(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sbd_mold_config_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
