export const modes = {
  transit: "公共交通",
  walking: "步行",
  driving: "驾车",
  bicycling: "骑行",
} as const;
export const transitModes = {
  bus: "公交",
  subway: "地铁",
  train: "火车",
  light_rail: "轻轨",
  rail: "铁路",
} as const;
export type Mode = keyof typeof modes;
export type TransitMode = keyof typeof transitModes;
export type Segment = { mode?: Mode; transitModes?: TransitMode[] };
export type Config = {
  key: string;
  view: "editor" | "embed";
  mode: Mode;
  points: string[];
  segments: Record<string, Segment>;
};
export const defaults: Config = {
  key: "",
  view: "editor",
  mode: "transit",
  points: ["", ""],
  segments: {},
};
export function location(value: string): string | { lat: number; lng: number } {
  const text = value.trim();
  if (!text) throw new Error("请填写地点");
  if (/^[+-]?[\d.]+\s*,\s*[+-]?[\d.]+$/.test(text)) {
    const [lat, lng] = text.split(",").map(Number);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      throw new Error("经纬度须在 ±90、±180 范围内");
    return { lat, lng };
  }
  // Localized addresses are more reliably geocoded with ASCII separators.
  return text.replace(/[，、]/g, ",");
}
export function validate(c: Config, requireKey = true): string[] {
  const errors: string[] = [];
  if (requireKey && !c.key.trim())
    errors.push("API Key：请填写 Google Maps 浏览器密钥");
  if (!Object.hasOwn(modes, c.mode)) errors.push("mode：不支持的默认交通方式");
  if (c.points.length < 2) errors.push("point：至少需要两个地点");
  c.points.forEach((p, i) => {
    try {
      location(p);
    } catch (e) {
      errors.push(`地点 ${i + 1}：${(e as Error).message}`);
    }
  });
  Object.entries(c.segments).forEach(([index, s]) => {
    if (
      !/^\d+$/.test(index) ||
      String(Number(index)) !== index ||
      Number(index) >= c.points.length - 1
    )
      errors.push(`segments.${index}：路段索引超出范围`);
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      errors.push(`segments.${index}：需要对象`);
      return;
    }
    if (s.mode !== undefined && !Object.hasOwn(modes, s.mode))
      errors.push(`segments.${index}.mode：不支持的交通方式`);
    if (
      s.transitModes !== undefined &&
      (!Array.isArray(s.transitModes) ||
        s.transitModes.some((m) => !Object.hasOwn(transitModes, m)))
    )
      errors.push(`segments.${index}.transitModes：不支持的公交偏好`);
  });
  return errors;
}
export function parse(search: string): { config: Config; errors: string[] } {
  const p = new URLSearchParams(search),
    errors: string[] = [];
  let segments = {};
  try {
    segments = JSON.parse(p.get("segments") || "{}");
    if (!segments || typeof segments !== "object" || Array.isArray(segments))
      throw new Error();
  } catch {
    errors.push("segments：必须是有效的 JSON 对象");
    segments = {};
  }
  const config: Config = {
    key: p.get("key") || "",
    view: p.get("view") === "embed" ? "embed" : "editor",
    mode: (p.get("mode") || "transit") as Mode,
    points: p.has("point") ? p.getAll("point") : ["", ""],
    segments,
  };
  if (p.has("view") && !["embed", "editor"].includes(p.get("view")!))
    errors.push("view：应为 editor 或 embed");
  return {
    config,
    errors: [...errors, ...(search ? validate(config, false) : [])],
  };
}
export function makeUrl(
  c: Config,
  base: string,
  view: Config["view"] = "embed",
): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", view);
  url.searchParams.set("key", c.key.trim());
  url.searchParams.set("mode", c.mode);
  c.points.forEach((p) => url.searchParams.append("point", p.trim()));
  if (Object.keys(c.segments).length)
    url.searchParams.set("segments", JSON.stringify(c.segments));
  return url.href;
}
export function effective(c: Config, i: number): Segment & { mode: Mode } {
  return { ...c.segments[i], mode: c.segments[i]?.mode || c.mode };
}
