import { location } from "./config";
export type Position = { lat: number; lng: number };
export type PointResult = {
  status: "loading" | "success" | "error";
  position?: Position;
  error?: string;
};
export type Locate = (address: string) => Promise<Position>;
export function pointError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/REQUEST_DENIED|PERMISSION_DENIED|API key/i.test(detail))
    return "地点定位被拒绝，请检查 Geocoding API、密钥和域名限制。";
  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|quota/i.test(detail))
    return "地点定位配额已用尽，请检查配额和结算状态。";
  if (/ZERO_RESULTS|NOT_FOUND/i.test(detail))
    return "未找到此地点，请填写更完整的地址或经纬度。";
  return `地点定位失败：${detail}`;
}
export class PointRunner {
  private generation = 0;
  cancel() {
    this.generation++;
  }
  async run(
    points: string[],
    locate: Locate,
    update: (i: number, r: PointResult) => void,
    indices = points.map((_, i) => i),
  ) {
    const token = ++this.generation;
    const pending = new Map<string, Promise<Position>>();
    let next = 0;
    indices.forEach((i) => update(i, { status: "loading" }));
    await Promise.all(
      Array.from({ length: Math.min(3, indices.length) }, async () => {
        while (next < indices.length && token === this.generation) {
          const i = indices[next++];
          try {
            const value = location(points[i]);
            let position: Position;
            if (typeof value === "string") {
              if (!pending.has(value)) pending.set(value, locate(value));
              position = await pending.get(value)!;
            } else position = value;
            if (
              !Number.isFinite(position.lat) ||
              !Number.isFinite(position.lng) ||
              Math.abs(position.lat) > 90 ||
              Math.abs(position.lng) > 180
            )
              throw new Error("地点坐标无效");
            if (token === this.generation)
              update(i, { status: "success", position });
          } catch (error) {
            if (token === this.generation)
              update(i, { status: "error", error: pointError(error) });
          }
        }
      }),
    );
  }
}
export function distanceKm(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
