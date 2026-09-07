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
          } catch {
            if (token === this.generation)
              update(i, {
                status: "error",
                error:
                  "此段暂无可用路线。请检查地点、交通覆盖，以及 Key 的 API 权限和配额。",
              });
          }
        }
      }),
    );
  }
}
