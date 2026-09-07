export const apiKeyStorageKey = "routeflow-google-maps-api-key";

export function loadApiKey(): string {
  try {
    return localStorage.getItem(apiKeyStorageKey) || "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(apiKeyStorageKey, key);
    else localStorage.removeItem(apiKeyStorageKey);
  } catch {
    // The editor remains usable when browser storage is unavailable.
  }
}
