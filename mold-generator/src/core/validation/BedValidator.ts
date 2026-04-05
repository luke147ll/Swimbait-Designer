import * as THREE from 'three';
import type { PrinterProfile, ValidationResult, ValidationError } from '../types';
import { PRINTER_PROFILES } from '../constants';

export class BedValidator {
  validate(
    halfA: THREE.BufferGeometry,
    halfB: THREE.BufferGeometry | null,
    printer: PrinterProfile
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const suggestions: string[] = [];

    halfA.computeBoundingBox();
    const sizeA = new THREE.Vector3();
    halfA.boundingBox!.getSize(sizeA);

    let sizeB: THREE.Vector3 | null = null;
    if (halfB) {
      halfB.computeBoundingBox();
      sizeB = new THREE.Vector3();
      halfB.boundingBox!.getSize(sizeB);
    }

    // Check halfA dimensions
    this.checkDimension(sizeA.x, printer.usableX, 'Half A length', 'X', 'A', errors, warnings);
    this.checkDimension(sizeA.y, printer.usableY, 'Half A height', 'Y', 'A', errors, warnings);
    this.checkDimension(sizeA.z, printer.usableZ, 'Half A depth', 'Z', 'A', errors, warnings);

    // Check halfB dimensions
    if (sizeB) {
      this.checkDimension(sizeB.x, printer.usableX, 'Half B length', 'X', 'B', errors, warnings);
      this.checkDimension(sizeB.y, printer.usableY, 'Half B height', 'Y', 'B', errors, warnings);
      this.checkDimension(sizeB.z, printer.usableZ, 'Half B depth', 'Z', 'B', errors, warnings);
    }

    // Side-by-side check
    let canPrintBothOnOneBed = false;
    if (sizeB) {
      const sideBySide = sizeA.x + sizeB.x + 10;
      const maxY = Math.max(sizeA.y, sizeB.y);
      canPrintBothOnOneBed = sideBySide <= printer.usableX && maxY <= printer.usableY;
    }

    // Suggestions
    if (errors.length > 0) {
      suggestions.push('Reduce wall margins to minimum (5mm)');
      suggestions.push('Switch to external clamp mode to remove flange');

      const fittingPrinters = PRINTER_PROFILES.filter(p =>
        sizeA.x <= p.usableX && sizeA.y <= p.usableY && sizeA.z <= p.usableZ
      );
      if (fittingPrinters.length > 0) {
        suggestions.push(`Switch to ${fittingPrinters[0].name} (${fittingPrinters[0].usableX}mm bed)`);
      }

      if (sizeA.x > printer.usableX && sizeA.y <= printer.usableX && sizeA.x <= printer.usableY) {
        suggestions.push('Rotate mold 90° on the print bed');
      }
    }

    return { valid: errors.length === 0, errors, warnings, suggestions, canPrintBothOnOneBed };
  }

  private checkDimension(
    moldSize: number, bedSize: number, label: string, axis: string, half: string,
    errors: ValidationError[], warnings: ValidationError[]
  ): void {
    if (moldSize > bedSize) {
      errors.push({
        code: `BED_${axis}_EXCEED_${half}`,
        severity: 'error',
        message: `${label} (${moldSize.toFixed(1)}mm) exceeds bed (${bedSize}mm) by ${(moldSize - bedSize).toFixed(1)}mm`,
        suggestion: 'Reduce margins or select a larger printer',
      });
    } else if (moldSize > bedSize - 5) {
      warnings.push({
        code: `BED_${axis}_TIGHT_${half}`,
        severity: 'warning',
        message: `${label} (${moldSize.toFixed(1)}mm) is within 5mm of bed limit`,
      });
    }
  }
}
