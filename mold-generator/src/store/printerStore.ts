import { create } from 'zustand';
import type { PrinterProfile } from '../core/types';
import { PRINTER_PROFILES } from '../core/constants';

interface PrinterState {
  selectedProfile: PrinterProfile;
  setProfile: (profile: PrinterProfile) => void;
  setCustomDimensions: (x: number, y: number, z: number) => void;
}

export const usePrinterStore = create<PrinterState>((set) => ({
  selectedProfile: PRINTER_PROFILES[0],
  setProfile: (profile: PrinterProfile) => set({ selectedProfile: profile }),
  setCustomDimensions: (x: number, y: number, z: number) => set({
    selectedProfile: {
      id: 'custom', name: 'Custom', bedX: x, bedY: y, bedZ: z,
      usableX: x - 5, usableY: y - 5, usableZ: z - 5, isCustom: true,
    },
  }),
}));
