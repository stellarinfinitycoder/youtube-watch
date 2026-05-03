export type AppTheme = "dark" | "lite";

export const APP_THEME_STORAGE_KEY = "youtube-watch:theme:v1";
export const DEFAULT_APP_THEME: AppTheme = "dark";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

export function normalizeAppTheme(value: unknown): AppTheme {
  return value === "lite" || value === "dark" ? value : DEFAULT_APP_THEME;
}

export function readStoredAppTheme(): AppTheme {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_APP_THEME;
  }
  try {
    return normalizeAppTheme(storage.getItem(APP_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_THEME;
  }
}

export function writeStoredAppTheme(theme: AppTheme): void {
  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  try {
    storage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures.
  }
}

export function getNextAppTheme(theme: AppTheme): AppTheme {
  return theme === "dark" ? "lite" : "dark";
}
