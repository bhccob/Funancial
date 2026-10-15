import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger' | 'reward';
export type Toast = { id: number; tone: ToastTone; message: string };

const MAX_TOASTS = 3;
const LIFETIME_MS = 6_000;

export const toastStore = createStore<{ toasts: Toast[] }>()(() => ({ toasts: [] }));
let nextId = 1;

export function dismiss(id: number): void {
  toastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function toast(tone: ToastTone, message: string): void {
  const id = nextId++;
  toastStore.setState((s) => ({ toasts: [...s.toasts, { id, tone, message }].slice(-MAX_TOASTS) }));
  setTimeout(() => dismiss(id), LIFETIME_MS);
}

export function useToasts(): Toast[] {
  return useStore(toastStore, (s) => s.toasts);
}
