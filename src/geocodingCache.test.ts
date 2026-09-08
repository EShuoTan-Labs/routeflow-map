// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cachedLocate } from "./geocodingCache";
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it("reuses normalized addresses across sessions and expires after 30 days", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  const service = vi.fn(async () => ({ lat: 1, lng: 2 }));
  await cachedLocate(service)("  TOKYO ， Japan ");
  await cachedLocate(service)("tokyo,Japan");
  expect(service).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(1000 + 30 * 86400000);
  await cachedLocate(service)("tokyo,Japan");
  expect(service).toHaveBeenCalledTimes(2);
});
it("falls back when storage is unavailable and never caches failures", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  const service = vi
    .fn()
    .mockRejectedValueOnce(new Error("ZERO_RESULTS"))
    .mockResolvedValue({ lat: 1, lng: 2 });
  const locate = cachedLocate(service);
  await expect(locate("Place")).rejects.toThrow("ZERO_RESULTS");
  await expect(locate("Place")).resolves.toEqual({ lat: 1, lng: 2 });
  expect(service).toHaveBeenCalledTimes(2);
});
it("ignores malformed cache entries and rejects invalid coordinates", async () => {
  localStorage.setItem("routeflow:geocoding:v1:place", "{");
  const locate = cachedLocate(vi.fn(async () => ({ lat: 91, lng: 0 })));
  await expect(locate("Place")).rejects.toThrow("地点坐标无效");
});
