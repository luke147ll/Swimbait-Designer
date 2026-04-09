import { create } from 'zustand';

export type LogType = 'info' | 'success' | 'error';

interface LoadingLine {
  message: string;
  type: LogType;
}

interface LoadingState {
  lines: LoadingLine[];
  progress: number;
  totalSteps: number;
  finished: boolean;
  dismissed: boolean;
  log: (message: string, type?: LogType) => void;
  finish: () => void;
  dismiss: () => void;
}

export const useLoadingStore = create<LoadingState>((set, get) => ({
  lines: [],
  progress: 0,
  totalSteps: 10,
  finished: false,
  dismissed: false,
  log: (message, type = 'info') => {
    const s = get();
    const newProgress = Math.min(s.progress + 1, s.totalSteps);
    set({ lines: [...s.lines, { message, type }], progress: newProgress });
  },
  finish: () => {
    const s = get();
    set({
      lines: [...s.lines, { message: 'mold ready.', type: 'success' }],
      progress: s.totalSteps,
      finished: true,
    });
  },
  dismiss: () => set({ dismissed: true }),
}));
