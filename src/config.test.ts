import { describe, it, expect } from "vitest";
import {
  defaults,
  location,
  makeUrl,
  readableUrl,
  parse,
  validate,
  type Config,
} from "./config";
describe("URL configuration", () => {
  it("shows Chinese in copyable links while preserving query values", () => {
    const c: Config = {
      ...defaults,
      view: "embed",
      key: "example-key",
      points: ["东京站 & 丸之内+出口#1?路线=北%20", "浅草寺，东京 🗼"],
    };
    const url = readableUrl(makeUrl(c, "https://example.com/"));
    expect(url).toContain("东京站");
    expect(url).toContain("浅草寺，东京");
    expect(parse(new URL(url).search)).toEqual({ config: c, errors: [] });
  });
  it("round trips addresses and coordinates under a project path", () => {
    const c: Config = {
      ...defaults,
      key: "example-key",
      view: "embed",
      points: ["东京站 & 丸之内", "35.71,139.81", "浅草寺"],
    };
    const url = new URL(
      makeUrl(c, "https://example.github.io/routeflow-map/?old=yes#test"),
    );
    expect(url.pathname).toBe("/routeflow-map/");
    expect(url.hash).toBe("");
    expect(parse(url.search)).toEqual({ config: c, errors: [] });
  });
  it("validates coordinates and preserves addresses", () => {
    expect(location("-90, 180")).toEqual({ lat: -90, lng: 180 });
    expect(location("35，139")).toEqual({ lat: 35, lng: 139 });
    expect(location("浅草寺，东京")).toBe("浅草寺,东京");
    expect(() => location("91,0")).toThrow();
    expect(() => location("1,181")).toThrow();
    expect(() => location(" ")).toThrow();
  });
  it("accepts existing links and emits only current parameters", () => {
    const { config, errors } = parse(
      "?view=embed&key=test&point=A&point=B&mode=walking&segments=invalid",
    );
    expect(errors).toEqual([]);
    expect([
      ...new URL(makeUrl(config, "https://example.com")).searchParams.keys(),
    ]).toEqual(["view", "key", "point", "point"]);
  });
  it("validates view, key and points", () => {
    expect(parse("?view=bad&point=A&point=B").errors).toHaveLength(1);
    expect(validate(defaults)).toHaveLength(3);
    expect(validate({ ...defaults, key: "k", points: ["A"] })).toHaveLength(1);
    expect(parse("")).toEqual({ config: defaults, errors: [] });
  });
});
