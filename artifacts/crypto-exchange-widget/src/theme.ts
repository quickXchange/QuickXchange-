import { useSyncExternalStore } from 'react';

const THEME_STORAGE_KEY = 'qx-theme';
const THEME_CHANGE_EVENT = 'qx-theme-change';

function currentThemeIsDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function subscribeToTheme(onStoreChange: () => void): () => void {
  const handleThemeChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const nextIsDark = event.newValue === 'dark';
    document.documentElement.classList.toggle('dark', nextIsDark);
    onStoreChange();
  };

  document.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    document.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function setAppTheme(nextIsDark: boolean): void {
  if (currentThemeIsDark() === nextIsDark) return;
  document.documentElement.classList.toggle('dark', nextIsDark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? 'dark' : 'light');
  } catch {
    // Theme switching still works when storage is unavailable.
  }
  document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: nextIsDark }));
}

export function setTransientAppTheme(nextIsDark: boolean): void {
  if (currentThemeIsDark() === nextIsDark) return;
  document.documentElement.classList.toggle('dark', nextIsDark);
  document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: nextIsDark }));
}

export function useAppTheme(): boolean {
  return useSyncExternalStore(subscribeToTheme, currentThemeIsDark, () => false);
}