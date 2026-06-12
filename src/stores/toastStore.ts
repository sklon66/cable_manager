import { create } from 'zustand';

interface ToastState {
  message: string;
  /** Bumped on every show() so an identical message still retriggers the timer. */
  nonce: number;
  show: (message: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>(set => ({
  message: '',
  nonce: 0,
  show: message => set(s => ({ message, nonce: s.nonce + 1 })),
  clear: () => set({ message: '' }),
}));

export const showToast = (message: string) => useToastStore.getState().show(message);
