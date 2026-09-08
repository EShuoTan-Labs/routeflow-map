export type Config = {
  key: string;
  view: "editor" | "embed";
  points: string[];
};
export const defaults: Config = { key: "", view: "editor", points: ["", ""] };
export function readableUrl(url: string): string {
  // Decode UTF-8 characters while preserving escaped URL separators and ASCII.
  return url.replace(/(?:%[c-f][0-9a-f](?:%[89ab][0-9a-f])+)+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  });
}
export function location(value: string): string | { lat: number; lng: number } {
  const text = value.trim().replace(/[，、]/g, ",");
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
  if (c.points.length < 2) errors.push("point：至少需要两个地点");
  c.points.forEach((p, i) => {
    try {
      location(p);
    } catch (e) {
      errors.push(`地点 ${i + 1}：${(e as Error).message}`);
    }
  });
  return errors;
}
export function parse(search: string): { config: Config; errors: string[] } {
  const p = new URLSearchParams(search),
    errors: string[] = [];
  const config: Config = {
    key: p.get("key") || "",
    view: p.get("view") === "embed" ? "embed" : "editor",
    points: p.has("point") ? p.getAll("point") : ["", ""],
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
  c.points.forEach((p) => url.searchParams.append("point", p.trim()));
  return url.href;
}
