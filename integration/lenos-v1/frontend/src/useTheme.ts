import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const storageKey = 'aurie-theme';

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Storage may be disabled. */ }
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setTheme(getInitialTheme());
    };
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener('storage', syncStorage);
    };
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(storageKey, next); } catch { /* Still allow switching this visit. */ }
    setTheme(next);
  };
  return { theme, toggleTheme };
}
