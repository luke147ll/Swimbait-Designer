import * as THREE from 'three';
import type { MoldState, BillOfMaterials, BOMItem } from '../types';

export class BOMGenerator {
  generateBOM(state: Partial<MoldState>): BillOfMaterials {
    const items: BOMItem[] = [];

    if (state.alignmentConfig?.type === 'dowel_pin') {
      items.push({
        name: 'Stainless Steel Dowel Pin',
        quantity: state.alignmentConfig.pinCount,
        size: `${state.alignmentConfig.pinDiameter}mm × ${state.alignmentConfig.pinLength}mm`,
        material: 'Stainless Steel',
        notes: 'Press into Half A sockets. Half B is slip fit.',
      });
    }

    if (state.clampConfig?.mode === 'through_bolt') {
      items.push({
        name: 'Socket Head Cap Screw',
        quantity: state.clampConfig.boltCount,
        size: `${state.clampConfig.boltSize} × 35mm`,
        material: 'Stainless Steel',
      });
      items.push({
        name: 'Wing Nut',
        quantity: state.clampConfig.boltCount,
        size: state.clampConfig.boltSize,
        material: 'Stainless Steel',
      });
      items.push({
        name: 'Flat Washer',
        quantity: state.clampConfig.boltCount * 2,
        size: state.clampConfig.boltSize,
        material: 'Stainless Steel',
      });
    }

    let estimatedFilamentGrams = 0;
    let estimatedFilamentMeters = 0;

    if (state.moldHalfA) {
      state.moldHalfA.computeBoundingBox();
      const sA = new THREE.Vector3();
      state.moldHalfA.boundingBox!.getSize(sA);
      const volA = (sA.x * sA.y * sA.z) / 1000;

      let volB = 0;
      if (state.moldHalfB) {
        state.moldHalfB.computeBoundingBox();
        const sB = new THREE.Vector3();
        state.moldHalfB.boundingBox!.getSize(sB);
        volB = (sB.x * sB.y * sB.z) / 1000;
      }

      const totalVol = (volA + volB) * 0.4;
      estimatedFilamentGrams = Math.round(totalVol * 1.27);
      estimatedFilamentMeters = Math.round(estimatedFilamentGrams * 0.33) / 10;
    }

    return {
      items,
      estimatedFilamentGrams,
      estimatedFilamentMeters,
      recommendedMaterial: 'PETG',
      recommendedPrintSettings: {
        layerHeight: '0.16 – 0.20 mm',
        wallCount: '4 – 6 perimeters',
        infill: '40 – 60% grid',
        infillPattern: 'Grid or Cubic',
        orientation: 'Parting face down on bed',
      },
    };
  }

  formatBOM(bom: BillOfMaterials): string {
    let text = 'SBD Mold Generator — Bill of Materials\n';
    text += '='.repeat(50) + '\n\n';
    text += 'HARDWARE\n';
    text += '-'.repeat(50) + '\n';
    for (const item of bom.items) {
      text += `${item.quantity}x  ${item.name}    ${item.size}  (${item.material})\n`;
      if (item.notes) text += `    ${item.notes}\n`;
    }
    text += '\nFILAMENT ESTIMATE\n';
    text += '-'.repeat(50) + '\n';
    text += `Material:  ${bom.recommendedMaterial}\n`;
    text += `Weight:    ~${bom.estimatedFilamentGrams}g\n`;
    text += `Length:    ~${bom.estimatedFilamentMeters}m\n`;
    text += '\nRECOMMENDED PRINT SETTINGS\n';
    text += '-'.repeat(50) + '\n';
    text += `Layer height:   ${bom.recommendedPrintSettings.layerHeight}\n`;
    text += `Walls:          ${bom.recommendedPrintSettings.wallCount}\n`;
    text += `Infill:         ${bom.recommendedPrintSettings.infill}\n`;
    text += `Pattern:        ${bom.recommendedPrintSettings.infillPattern}\n`;
    text += `Orientation:    ${bom.recommendedPrintSettings.orientation}\n`;
    return text;
  }
}
