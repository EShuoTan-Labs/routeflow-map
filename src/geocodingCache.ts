import type { Locate, Position } from "./routes";

const PREFIX = "routeflow:geocoding:v1:";
const TTL = 30 * 24 * 60 * 60 * 1000;
function valid(p: Position): boolean {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
export function cachedLocate(locate: Locate): Locate {
  const pending = new Map<string, Promise<Position>>();
  return (address) => {
    const normalized = address
      .normalize("NFKC")
      .trim()
      .replace(/[，、]/g, ",")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ",")
      .toLowerCase();
    const key = PREFIX + normalized;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const entry = JSON.parse(raw);
        if (
          valid(entry.position) &&
          Number.isFinite(entry.createdAt) &&
          Date.now() >= entry.createdAt &&
          Date.now() - entry.createdAt < TTL
        )
          return Promise.resolve(entry.position);
        localStorage.removeItem(key);
      }
    } catch {
      /* Storage is optional. */
    }
    if (!pending.has(key)) {
      const request = locate(address)
        .then((position) => {
          if (!valid(position)) throw new Error("地点坐标无效");
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ position, createdAt: Date.now() }),
            );
          } catch {
            /* Quota and privacy settings must not block locating. */
          }
          return position;
        })
        .finally(() => pending.delete(key));
      pending.set(key, request);
    }
    return pending.get(key)!;
  };
}
