import { create } from 'zustand';

interface ViewportState {
  explode: boolean;
  sectionCut: boolean;
  showBait: boolean;
  showBedBounds: boolean;
  toggleExplode: () => void;
  toggleSectionCut: () => void;
  toggleShowBait: () => void;
  toggleShowBedBounds: () => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  explode: false,
  sectionCut: false,
  showBait: true,
  showBedBounds: false,
  toggleExplode: () => set((s) => ({ explode: !s.explode })),
  toggleSectionCut: () => set((s) => ({ sectionCut: !s.sectionCut })),
  toggleShowBait: () => set((s) => ({ showBait: !s.showBait })),
  toggleShowBedBounds: () => set((s) => ({ showBedBounds: !s.showBedBounds })),
}));
