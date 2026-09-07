import { describe, it, expect, vi } from "vitest";
import { PointRunner, distanceKm, type PointResult } from "./routes";
describe("point positioning", () => {
  it("uses coordinates directly and deduplicates repeated addresses", async () => {
    const locate = vi.fn(async () => ({ lat: 35, lng: 139 })),
      update = vi.fn();
    await new PointRunner().run(["0,0", "东京", "东京"], locate, update);
    expect(locate).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(0, {
      status: "success",
      position: { lat: 0, lng: 0 },
    });
  });
  it("limits concurrency and retries only failed points", async () => {
    let active = 0,
      peak = 0;
    const results: Record<number, PointResult> = {};
    const locate = vi.fn(async (address: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (address === "B") throw new Error("ZERO_RESULTS");
      return { lat: 1, lng: 2 };
    });
    const runner = new PointRunner(),
      update = (i: number, r: PointResult) => {
        results[i] = r;
      };
    await runner.run(["A", "B", "C", "D"], locate, update);
    expect(peak).toBe(3);
    expect(results[1].status).toBe("error");
    const original = results[0],
      retry = vi.fn(async () => ({ lat: 2, lng: 3 }));
    await runner.run(["A", "B", "C", "D"], retry, update, [1]);
    expect(retry).toHaveBeenCalledExactlyOnceWith("B");
    expect(results[0]).toBe(original);
    expect(results[1].status).toBe("success");
  });
  it("discards late responses after cancellation", async () => {
    let release!: (value: { lat: number; lng: number }) => void;
    const second = new PointRunner(),
      secondUpdate = vi.fn();
    const pending = second.run(
      ["A"],
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      secondUpdate,
    );
    second.cancel();
    release({ lat: 1, lng: 2 });
    await pending;
    expect(secondUpdate).toHaveBeenCalledTimes(1);
  });
  it("calculates geographic distance including coincident and dateline points", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111.195,
      2,
    );
    expect(distanceKm({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0);
    expect(distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeCloseTo(
      222.39,
      2,
    );
  });
});
