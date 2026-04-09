import { create } from 'zustand';
import type { PrinterProfile, PrintOrientation } from '../core/types';
import { PRINTER_PROFILES } from '../core/constants';

interface PrinterState {
  selectedProfile: PrinterProfile;
  printOrientation: PrintOrientation;
  setProfile: (profile: PrinterProfile) => void;
  setCustomDimensions: (x: number, y: number, z: number) => void;
  setPrintOrientation: (orientation: PrintOrientation) => void;
}

export const usePrinterStore = create<PrinterState>((set) => ({
  selectedProfile: PRINTER_PROFILES.find(p => p.id === 'bambu_x1c') || PRINTER_PROFILES[0],
  printOrientation: 'on_edge',
  setProfile: (profile: PrinterProfile) => set({ selectedProfile: profile }),
  setCustomDimensions: (x: number, y: number, z: number) => set({
    selectedProfile: {
      id: 'custom', name: 'Custom', bedX: x, bedY: y, bedZ: z,
      usableX: x - 5, usableY: y - 5, usableZ: z - 5, isCustom: true,
    },
  }),
  setPrintOrientation: (orientation: PrintOrientation) => set({ printOrientation: orientation }),
}));
