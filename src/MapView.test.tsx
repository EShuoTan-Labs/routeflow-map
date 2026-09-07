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
const geocode = vi.fn(),
  imports = vi.fn();
const lines: any[] = [],
  markers: any[] = [],
  maps: FakeMap[] = [];
class FakeMap {
  getZoom = vi.fn(() => 15);
  fitBounds = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  options: any;
  constructor(_host: HTMLElement, options: any) {
    this.options = options;
    maps.push(this);
  }
}
class Bounds {
  extend() {}
}
class Polyline {
  map: any;
  constructor(public options: any) {
    this.map = options.map;
    lines.push(this);
  }
  addListener() {
    return { remove: vi.fn() };
  }
  setMap(map: any) {
    this.map = map;
  }
}
class Marker {
  map: any;
  constructor(public options: any) {
    this.map = options.map;
    markers.push(this);
  }
}
function setup(points = ["0,0", "0,1", "1,1"]) {
  imports.mockImplementation(async (name: string) => {
    if (name === "maps") return { Map: FakeMap };
    if (name === "marker") return {};
    if (name === "geocoding")
      return {
        Geocoder: class {
          geocode = geocode;
        },
      };
    throw new Error(`Unexpected library: ${name}`);
  });
  window.google = {
    maps: {
      importLibrary: imports,
      LatLngBounds: Bounds,
      Polyline,
      marker: { AdvancedMarkerElement: Marker },
    },
  };
  return render(<MapView config={{ ...defaults, key: "mock-only", points }} />);
}
const position = (lat: number, lng: number) => ({
  results: [{ geometry: { location: { lat: () => lat, lng: () => lng } } }],
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  geocode.mockReset();
  lines.length = 0;
  markers.length = 0;
  maps.length = 0;
});
describe("pin map", () => {
  it("loads transit on double click, preserves zoom and reuses mounted frames and overview", async () => {
    setup();
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(3));
    const first = screen.getByRole("button", { name: "1 0,0 到 2 0,1" });
    fireEvent.click(first);
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
    fireEvent.doubleClick(first);
    const frame = document.querySelector("iframe")!;
    const url = new URL(frame.src);
    expect(url.pathname).toBe("/maps/embed/v1/directions");
    expect(url.searchParams.get("mode")).toBe("transit");
    expect(url.searchParams.get("zoom")).toBe("15");
    expect(url.searchParams.get("origin")).toBe("0,0");
    expect(url.searchParams.get("destination")).toBe("0,1");
    expect(url.searchParams.get("center")).toBe("0,0.5");
    expect(screen.queryByRole("link", { name: "编辑行程 ↗" })).toBeNull();
    expect(screen.queryByRole("button", { name: "重置缩放" })).toBeNull();
    expect(document.querySelector("details")?.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "返回总览" }));
    fireEvent.doubleClick(
      screen.getByRole("button", { name: "2 0,1 到 3 1,1" }),
    );
    expect(frame.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "返回总览" }));
    fireEvent.doubleClick(first);
    expect(document.querySelector("iframe")).toBe(frame);
    expect(frame.hidden).toBe(false);
    const fitCalls = maps[0].fitBounds.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "返回总览" }));
    expect(frame.hidden).toBe(true);
    expect(document.querySelector("details")?.hidden).toBe(false);
    expect(screen.getByRole("link", { name: "编辑行程 ↗" })).toBeTruthy();
    expect(maps).toHaveLength(1);
    expect(maps[0].fitBounds).toHaveBeenCalledTimes(fitCalls);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(document.querySelector("iframe")).toBe(frame);
    expect(frame.hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "返回总览" }));
    maps[0].getZoom.mockReturnValue(12);
    fireEvent.doubleClick(first);
    const visible = [...document.querySelectorAll("iframe")].find(
      (f) => !f.hidden,
    )!;
    expect(new URL(visible.src).searchParams.get("zoom")).toBe("12");
    expect(geocode).not.toHaveBeenCalled();
  });

  it("zooms directly with the mouse wheel", async () => {
    setup();
    await waitFor(() => expect(maps).toHaveLength(1));
    expect(maps[0].options.gestureHandling).toBe("greedy");
  });

  it("draws numbered pins and two-endpoint straight lines without service requests", async () => {
    const view = setup();
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(3));
    expect(geocode).not.toHaveBeenCalled();
    expect(imports.mock.calls.map((c) => c[0])).toEqual(["maps", "marker"]);
    expect(
      markers.filter((m) => m.map).map((m) => m.options.content.textContent),
    ).toEqual(["1", "2", "3"]);
    expect(lines.filter((l) => l.map).map((l) => l.options.path)).toEqual([
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
      ],
      [
        { lat: 0, lng: 1 },
        { lat: 1, lng: 1 },
      ],
    ]);
    const map = markers.find((m) => m.map).map;
    map.fitBounds.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "重置缩放" }));
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    const editorUrl = new URL(
      screen.getByRole("link", { name: "编辑行程 ↗" }).getAttribute("href")!,
    );
    expect(editorUrl.searchParams.get("view")).toBe("editor");
    expect(editorUrl.searchParams.getAll("point")).toEqual([
      "0,0",
      "0,1",
      "1,1",
    ]);
    expect(screen.queryByText(/直线距离/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 0,0 到 2 0,1" }));
    expect(document.querySelector("details")?.open).toBe(true);
    expect(
      lines.filter((l) => l.map).some((l) => l.options.strokeWeight === 8),
    ).toBe(true);
    view.unmount();
    expect(markers.filter((m) => m.map)).toHaveLength(0);
    expect(lines.filter((l) => l.map)).toHaveLength(0);
  });
  it("keeps isolated pins and never bridges a failed middle point; retry restores adjacent lines", async () => {
    geocode.mockRejectedValueOnce(new Error("ZERO_RESULTS"));
    setup(["0,0", "Missing", "1,1"]);
    const retry = await screen.findByRole("button", { name: "重试地点 2" });
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(2));
    expect(lines.filter((l) => l.map)).toHaveLength(0);
    geocode.mockResolvedValueOnce(position(0, 1));
    fireEvent.click(retry);
    await waitFor(() => expect(lines.filter((l) => l.map)).toHaveLength(2));
    expect(geocode).toHaveBeenCalledTimes(2);
  });
  it("clears old geometry when configuration changes", async () => {
    const view = setup();
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(3));
    view.rerender(
      <MapView
        config={{ ...defaults, key: "mock-only", points: ["2,2", "3,3"] }}
      />,
    );
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(2));
    expect(lines.filter((l) => l.map)).toHaveLength(1);
    expect(markers.filter((m) => m.map).map((m) => m.options.position)).toEqual(
      [
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
    );
  });
});
