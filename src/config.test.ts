import { describe, it, expect } from "vitest";
import {
  defaults,
  effective,
  location,
  makeUrl,
  parse,
  validate,
  type Config,
} from "./config";
describe("URL configuration", () => {
  it("round trips Chinese addresses, reserved characters, coordinates and overrides under a project path", () => {
    const c: Config = {
      ...defaults,
      key: "example-key",
      view: "embed",
      points: ["东京站 & 丸之内", "35.71,139.81", "浅草寺"],
      segments: {
        "0": { mode: "walking" },
        "1": { transitModes: ["train", "subway"] },
      },
    };
    const url = new URL(
      makeUrl(c, "https://example.github.io/routeflow-map/?old=yes#test"),
    );
    expect(url.pathname).toBe("/routeflow-map/");
    expect(url.hash).toBe("");
    expect(parse(url.search)).toEqual({ config: c, errors: [] });
    expect(effective(c, 0).mode).toBe("walking");
    expect(effective(c, 1).mode).toBe("transit");
  });
  it("validates coordinates and preserves addresses", () => {
    expect(location("-90, 180")).toEqual({ lat: -90, lng: 180 });
    expect(location("Tokyo, Japan")).toBe("Tokyo, Japan");
    expect(location("浅草寺，东京")).toBe("浅草寺,东京");
    expect(location("东京站、东京")).toBe("东京站,东京");
    expect(() => location("91,0")).toThrow();
    expect(() => location("1,181")).toThrow();
    expect(() => location(" ")).toThrow();
  });
  it.each(["[]", "null", "{", '"text"'])(
    "reports malformed segment object %s",
    (raw) =>
      expect(
        parse(`?segments=${encodeURIComponent(raw)}`).errors.length,
      ).toBeGreaterThan(0),
  );
  it("reports invalid modes, segment indices, preference and view", () => {
    const result = parse(
      "?view=bad&mode=flying&point=A&point=B&segments=" +
        encodeURIComponent('{"2":{"mode":"flying","transitModes":["boat"]}}'),
    );
    expect(result.errors).toHaveLength(5);
  });
  it("requires key and two valid points", () =>
    expect(validate(defaults)).toHaveLength(3));
  it("defaults to transit and editor", () => {
    expect(parse("").config).toEqual(defaults);
    expect(parse("").errors).toEqual([]);
  });
});
