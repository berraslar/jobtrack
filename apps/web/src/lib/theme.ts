export type ThemeChoice = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'jobtrack-theme';

/** NFR-10: açık/koyu tema. "Sistem" seçiliyse işletim sisteminin tercihi kullanılır. */
export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Depolama kapalıysa (gizli pencere) tercih yalnızca bu oturumda geçerlidir.
  }
}
