// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { MapView } from "./MapView";
import { defaults } from "./config";
vi.mock("./google", () => ({ loadGoogle: vi.fn(async () => {}) }));
const query = vi.fn();
const lines: { options: any; listener?: () => void }[] = [];
class FakeMap {
  fitBounds = vi.fn();
}
class Bounds {
  empty = true;
  extend() {
    this.empty = false;
  }
  isEmpty() {
    return this.empty;
  }
}
class Polyline {
  listener?: () => void;
  constructor(public options: any) {
    lines.push(this);
  }
  addListener(_name: string, listener: () => void) {
    this.listener = listener;
  }
  setMap() {}
}
class Marker {
  constructor(public options: any) {}
}
function setup() {
  window.google = {
    maps: {
      importLibrary: async () => ({
        Map: FakeMap,
        Route: { computeRoutes: query },
      }),
      LatLngBounds: Bounds,
      Polyline,
      marker: { AdvancedMarkerElement: Marker },
    },
  };
  return render(
    <MapView
      config={{
        ...defaults,
        key: "mock-only",
        points: ["东京站", "浅草寺", "晴空塔"],
        segments: { "1": { mode: "walking" } },
      }}
    />,
  );
}
afterEach(() => {
  cleanup();
  query.mockReset();
  lines.length = 0;
});
const route = {
  path: [
    { lat: 35, lng: 139 },
    { lat: 35.1, lng: 139.1 },
  ],
  distanceMeters: 1500,
  durationMillis: 600000,
  legs: [
    {
      steps: [
        {
          transitDetails: {
            transitLine: {
              shortName: "银座线",
              agencies: [
                {
                  name: "Tokyo Metro",
                  url: new URL("https://www.tokyometro.jp/"),
                },
              ],
            },
          },
        },
      ],
    },
  ],
};
describe("embedded map with simulated Google SDK", () => {
  it("renders mixed routes, numbered markers and transit attribution, and selects a route", async () => {
    query.mockResolvedValue({ routes: [route] });
    setup();
    await waitFor(() =>
      expect(screen.getAllByText("1.5 公里 · 约 10 分钟")).toHaveLength(2),
    );
    expect(query.mock.calls.map((c) => c[0].travelMode)).toEqual([
      "TRANSIT",
      "WALKING",
    ]);
    expect(
      screen
        .getAllByRole("link", { name: "Tokyo Metro" })[0]
        .getAttribute("href"),
    ).toBe("https://www.tokyometro.jp/");
    fireEvent.click(screen.getByRole("button", { name: "1 → 2 · 公共交通" }));
    expect(document.querySelector("details")?.open).toBe(true);
    expect(lines.some((l) => l.options.strokeWeight === 8)).toBe(true);
  });
  it("keeps a successful leg visible and retries only the failed leg", async () => {
    query
      .mockResolvedValueOnce({ routes: [route] })
      .mockRejectedValueOnce(new Error("no route"));
    setup();
    const retry = await screen.findByRole("button", { name: "重试此段" });
    expect(screen.getByText("1.5 公里 · 约 10 分钟")).toBeTruthy();
    query.mockResolvedValueOnce({ routes: [route] });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getAllByText("1.5 公里 · 约 10 分钟")).toHaveLength(2),
    );
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0].origin).toBe("浅草寺");
  });
});
