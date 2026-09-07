import { describe, it, expect, vi } from "vitest";
import { defaults, type Config } from "./config";
import {
  RouteRunner,
  requestFor,
  routeErrorMessage,
  type Result,
} from "./routes";
const c: Config = {
  ...defaults,
  key: "test",
  points: ["A", "B", "C", "D", "E", "F"],
  segments: { "1": { mode: "walking" }, "2": { transitModes: ["train"] } },
};
const success = {
  routes: [
    {
      path: [
        { lat: 1, lng: 2 },
        { lat: 2, lng: 3 },
      ],
      distanceMeters: 200,
      durationMillis: 60000,
    },
  ],
};
describe("route requests", () => {
  it("splits mixed traffic and consecutive transit into endpoint requests with current transit departure times", () => {
    const requests = [0, 1, 2, 3].map((i) => requestFor(c, i));
    expect(requests.map((r) => r.travelMode)).toEqual([
      "TRANSIT",
      "WALKING",
      "TRANSIT",
      "TRANSIT",
    ]);
    expect(requests[2].transitPreference?.allowedTransitModes).toEqual([
      "TRAIN",
    ]);
    expect(requests[2].origin).toBe("C");
    expect(requests[2].destination).toBe("D");
    requests.forEach((r) => {
      expect(r).not.toHaveProperty("intermediates");
    });
    expect(requests[0].departureTime).toBeInstanceOf(Date);
    expect(requests[1]).not.toHaveProperty("departureTime");
  });
  it("limits concurrency to three and preserves successful routes across failure and retry", async () => {
    let active = 0,
      peak = 0;
    const results: Record<number, Result> = {};
    const compute = vi.fn(async (r: ReturnType<typeof requestFor>) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (r.origin === "B") throw new Error("quota");
      return success;
    });
    const runner = new RouteRunner(),
      update = (i: number, r: Result) => {
        results[i] = r;
      };
    await runner.run(c, compute, update);
    expect(peak).toBe(3);
    expect(results[1].status).toBe("error");
    expect(results[4].status).toBe("success");
    const original = results[0];
    const retry = vi.fn(async () => success);
    await runner.run(c, retry, update, [1]);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(results[1].status).toBe("success");
    expect(results[0]).toBe(original);
  });
  it("rejects empty routes", async () => {
    const update = vi.fn();
    await new RouteRunner().run(c, async () => ({ routes: [] }), update, [0]);
    expect(update).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ status: "error" }),
    );
  });
  it("reports actionable route service errors", () => {
    expect(
      routeErrorMessage(new Error("PERMISSION_DENIED"), "transit"),
    ).toContain("Routes API");
    expect(
      routeErrorMessage(new Error("RESOURCE_EXHAUSTED"), "transit"),
    ).toContain("配额");
    expect(
      routeErrorMessage(new Error("backend unavailable"), "walking"),
    ).toContain("backend unavailable");
    expect(routeErrorMessage(new Error("no route"), "步行")).toContain(
      "步行路线",
    );
  });
  it("discards responses from a previous generation", async () => {
    let release!: (r: typeof success) => void;
    const runner = new RouteRunner(),
      oldUpdate = vi.fn(),
      currentUpdate = vi.fn();
    const old = runner.run(
      c,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      oldUpdate,
      [0],
    );
    await runner.run(c, async () => success, currentUpdate, [0]);
    release(success);
    await old;
    expect(oldUpdate).toHaveBeenCalledTimes(1);
    expect(currentUpdate).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ status: "success" }),
    );
  });
  it("stops queued work and ignores active responses after cancel", async () => {
    let release!: (r: typeof success) => void;
    const update = vi.fn(),
      runner = new RouteRunner();
    const work = runner.run(
      c,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      update,
      [0],
    );
    runner.cancel();
    release(success);
    await work;
    expect(update).toHaveBeenCalledTimes(1);
  });
});
