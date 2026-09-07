import { type Config, effective, location } from "./config";
export type RouteData = {
  path?: { lat: number; lng: number }[];
  distanceMeters?: number;
  durationMillis?: number;
  warnings?: string[];
  legs?: {
    steps?: {
      transitDetails?: {
        transitLine?: {
          name?: string;
          shortName?: string;
          agencies?: { name?: string; url?: URL | string }[];
        };
      };
    }[];
  }[];
};
export type Result = {
  status: "loading" | "success" | "error";
  route?: RouteData;
  error?: string;
};
export function requestFor(c: Config, index: number) {
  const s = effective(c, index);
  return {
    origin: location(c.points[index]),
    destination: location(c.points[index + 1]),
    travelMode: s.mode.toUpperCase(),
    fields: ["path", "legs", "distanceMeters", "durationMillis", "warnings"],
    ...(s.mode === "transit" ? { departureTime: new Date() } : {}),
    ...(s.mode === "transit" && s.transitModes?.length
      ? {
          transitPreference: {
            allowedTransitModes: s.transitModes.map((m) => m.toUpperCase()),
          },
        }
      : {}),
  };
}
export type Compute = (
  request: ReturnType<typeof requestFor>,
) => Promise<{ routes?: RouteData[] }>;
export function routeErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : "";
  if (/PERMISSION_DENIED|REQUEST_DENIED|API key|not authorized/i.test(detail))
    return "路线服务拒绝了请求。请确认 Key 已启用 Maps JavaScript API 和 Routes API，并允许当前网站域名。";
  if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|quota/i.test(detail))
    return "路线查询配额已用尽。请检查 Google Cloud 配额和结算状态。";
  if (/ZERO_RESULTS|NOT_FOUND|no route|未找到路线/i.test(detail))
    return "此段暂无可用公共交通路线，请调整地点或出发时间。";
  return detail ? `路线查询失败：${detail}` : "路线查询失败，请稍后重试。";
}
// The generation token prevents results from older configurations reaching the UI.
export class RouteRunner {
  private generation = 0;
  cancel() {
    this.generation++;
  }
  async run(
    c: Config,
    compute: Compute,
    update: (i: number, r: Result) => void,
    indices = c.points.slice(1).map((_, i) => i),
  ) {
    const token = ++this.generation;
    let next = 0;
    indices.forEach((i) => update(i, { status: "loading" }));
    await Promise.all(
      Array.from({ length: Math.min(3, indices.length) }, async () => {
        while (next < indices.length && token === this.generation) {
          const i = indices[next++];
          try {
            const { routes } = await compute(requestFor(c, i));
            if (!routes?.length || !routes[0].path?.length)
              throw new Error("未找到路线，请调整地点或交通方式");
            if (token === this.generation)
              update(i, { status: "success", route: routes[0] });
          } catch (error) {
            if (token === this.generation)
              update(i, {
                status: "error",
                error: routeErrorMessage(error),
              });
          }
        }
      }),
    );
  }
}
