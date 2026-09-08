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
  addListener = vi.fn((_event: string, callback: () => void) => {
    queueMicrotask(callback);
    return { remove: vi.fn() };
  });
  getZoom = vi.fn(() => 15);
  getCenter = vi.fn(() => ({ lat: (): number => 0.5, lng: (): number => 0.5 }));
  fitBounds = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  moveCamera = vi.fn();
  getProjection = vi.fn(() => ({
    fromLatLngToPoint: (p: any) => ({ x: p.lng(), y: p.lat() }),
    fromPointToLatLng: (p: any) => ({ lat: p.y, lng: p.x }),
  }));
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
      Point: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
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
  localStorage.clear();
  vi.clearAllMocks();
  geocode.mockReset();
  lines.length = 0;
  markers.length = 0;
  maps.length = 0;
});
describe("pin map", () => {
  it("combines exact coordinates in itinerary order while keeping nearby pins and route segments", async () => {
    setup(["0,0", "0,0.0000001", "0,0", "0.0000001,0", "0,0"]);
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(3));
    const active = markers.filter((m) => m.map);
    expect(active.map((m) => m.options.content.textContent)).toEqual([
      "1&3&5",
      "2",
      "4",
    ]);
    expect(active[0].options.title).toBe("1. 0,0\n3. 0,0\n5. 0,0");
    expect(lines.filter((l) => l.map)).toHaveLength(4);
  });

  it("combines an address with an existing pin when its coordinates resolve", async () => {
    let resolveAddress!: (value: ReturnType<typeof position>) => void;
    geocode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAddress = resolve;
        }),
    );
    setup(["10,20", "Return stop"]);
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(1));
    expect(markers.find((m) => m.map).options.content.textContent).toBe("1");
    resolveAddress(position(10, 20));
    await waitFor(() =>
      expect(markers.find((m) => m.map).options.content.textContent).toBe(
        "1&2",
      ),
    );
    expect(markers.filter((m) => m.map)).toHaveLength(1);
  });

  it("creates the map before markers load and fits once after all addresses settle", async () => {
    let resolveMarker!: (value: object) => void;
    let resolveFirst!: (value: ReturnType<typeof position>) => void;
    let resolveLast!: (value: ReturnType<typeof position>) => void;
    geocode
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLast = resolve;
          }),
      );
    setup(["First", "Last"]);
    const original = imports.getMockImplementation()!;
    imports.mockImplementation((name: string) =>
      name === "marker"
        ? new Promise((resolve) => {
            resolveMarker = resolve;
          })
        : original(name),
    );
    await waitFor(() => expect(maps).toHaveLength(1));
    expect(screen.getByRole("status").textContent).toContain("正在定位行程");
    expect(markers).toHaveLength(0);
    resolveFirst(position(10, 20));
    await waitFor(() => expect(geocode).toHaveBeenCalledTimes(2));
    expect(maps[0].fitBounds).not.toHaveBeenCalled();
    expect(maps[0].setCenter).not.toHaveBeenCalled();
    resolveLast(position(30, 40));
    await waitFor(() => expect(maps[0].fitBounds).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    resolveMarker({});
    await waitFor(() => expect(markers.filter((m) => m.map)).toHaveLength(2));
    expect(maps[0].fitBounds).toHaveBeenCalledTimes(1);
  });

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
    expect(url.searchParams.get("center")).toBe("0.5,0.5");
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
    maps[0].getCenter.mockReturnValue({ lat: () => 2, lng: () => 3 });
    fireEvent.doubleClick(first);
    const panned = [...document.querySelectorAll("iframe")].find(
      (f) => !f.hidden,
    )!;
    expect(panned).not.toBe(frame);
    expect(new URL(panned.src).searchParams.get("center")).toBe("2,3");
    expect(new URL(panned.src).searchParams.get("zoom")).toBe("15");
    fireEvent.click(screen.getByRole("button", { name: "返回总览" }));
    maps[0].getZoom.mockReturnValue(12);
    fireEvent.doubleClick(first);
    const visible = [...document.querySelectorAll("iframe")].find(
      (f) => !f.hidden,
    )!;
    expect(new URL(visible.src).searchParams.get("zoom")).toBe("12");
    expect(geocode).not.toHaveBeenCalled();
  });

  it("zooms directly with a mouse wheel while delegating touch gestures to Google", async () => {
    setup();
    await waitFor(() => expect(maps).toHaveLength(1));
    expect(maps[0].options.gestureHandling).toBe("cooperative");

    const mapSurface = document.createElement("div");
    const touchMove = vi.fn();
    mapSurface.addEventListener("touchmove", touchMove);
    document.querySelector(".google-map")!.append(mapSurface);
    fireEvent.touchMove(mapSurface, { touches: [{}] });
    expect(touchMove).toHaveBeenCalledTimes(1);

    fireEvent.wheel(mapSurface, { deltaY: -100 });
    expect(maps[0].moveCamera).toHaveBeenLastCalledWith({
      center: { lat: 0.5, lng: 0.5 },
      zoom: 16,
    });
    fireEvent.wheel(mapSurface, { deltaY: 100 });
    expect(maps[0].moveCamera).toHaveBeenLastCalledWith({
      center: { lat: 0.5, lng: 0.5 },
      zoom: 14,
    });
  });

  it("keeps the location under an off-center cursor fixed while zooming in and out", async () => {
    setup();
    await waitFor(() => expect(maps).toHaveLength(1));
    const surface = document.querySelector(".google-map")!;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 800,
      height: 600,
    } as DOMRect);
    for (const deltaY of [-100, 100]) {
      fireEvent.wheel(surface, { deltaY, clientX: 700, clientY: 200 });
      const { center, zoom } = maps[0].moveCamera.mock.lastCall![0];
      expect((0.5 + 200 / 2 ** 15 - center.lng) * 2 ** zoom).toBeCloseTo(200);
      expect((0.5 - 150 / 2 ** 15 - center.lat) * 2 ** zoom).toBeCloseTo(-150);
    }
    maps[0].moveCamera.mockClear();
    maps[0].getZoom.mockReturnValue(21);
    fireEvent.wheel(surface, { deltaY: -100 });
    maps[0].getZoom.mockReturnValue(0);
    fireEvent.wheel(surface, { deltaY: 100 });
    expect(maps[0].moveCamera).not.toHaveBeenCalled();
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
