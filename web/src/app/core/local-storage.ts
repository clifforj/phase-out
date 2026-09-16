export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function readJson<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  const stored = readStorage(key);
  if (!stored) return fallback;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
