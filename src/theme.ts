import { useSyncExternalStore } from 'react';

/** Tema da interface (claro/escuro), lembrado neste navegador. A arte e o papel não mudam. */
export type Theme = 'light' | 'dark';
const KEY = 'cutpaper:theme';
const listeners = new Set<() => void>();

const initial = (): Theme => {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* sem armazenamento */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

let current: Theme = initial();
const apply = () => {
  const el = document.documentElement;
  el.classList.toggle('dark', current === 'dark');
  el.classList.toggle('light', current === 'light');
  el.style.colorScheme = current;
};
apply();

export const setTheme = (t: Theme) => {
  current = t;
  apply();
  try { localStorage.setItem(KEY, t); } catch { /* sem armazenamento */ }
  listeners.forEach((l) => l());
};
export const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark');
export const useTheme = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
