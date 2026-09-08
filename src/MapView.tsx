import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type Config, makeUrl, location } from "./config";
import { loadGoogle } from "./google";
import { cachedLocate } from "./geocodingCache";
import { PointRunner, type PointResult, type Locate } from "./routes";
function MapIcon({
  name,
}: {
  name: "back" | "fit" | "edit" | "route" | "retry";
}) {
  const paths = {
    back: "M19 12H5m6-6-6 6 6 6",
    fit: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8",
    edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z",
    route:
      "M7 6h9a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8m-1-19a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm10 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    retry:
      "M20 7v5h-5M4 17v-5h5m10-4a8 8 0 0 0-13-2L4 9m16 6-2 3a8 8 0 0 1-13-2",
  };
  return (
    <svg
      className="map-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function MapView({ config }: { config: Config }) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null);
  const runner = useRef(new PointRunner()),
    locate = useRef<Locate | null>(null);
  const [mapConfig, setMapConfig] = useState<Config | null>(null);
  const [markerReady, setMarkerReady] = useState(false);
  const [visibleConfig, setVisibleConfig] = useState<Config | null>(null);
  const hasAddresses = config.points.some((point) => {
    try {
      return typeof location(point) === "string";
    } catch {
      return true;
    }
  });
  const [results, setResults] = useState<Record<number, PointResult>>({});
  const [routeFrames, setRouteFrames] = useState<
    { url: string; title: string }[]
  >([]);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null);
  const update = (i: number, result: PointResult) =>
    setResults((prev) => ({ ...prev, [i]: result }));
  useEffect(() => {
    let disposed = false;
    setResults({});
    setMarkerReady(false);
    setMapConfig(null);
    setVisibleConfig(null);
    setError("");
    setSelected(null);
    setActiveRoute(null);
    setRouteFrames([]);
    map.current = null;
    locate.current = null;
    loadGoogle(config.key)
      .then(async () => {
        const mapsLibrary = window.google.maps.importLibrary("maps");
        const markerLibrary = window.google.maps.importLibrary("marker");
        let geocoder: Promise<any> | undefined;
        locate.current = cachedLocate(async (address) => {
          geocoder ??= window.google.maps
            .importLibrary("geocoding")
            .then(({ Geocoder }: any) => new Geocoder());
          const { results } = await (await geocoder).geocode({ address });
          const position = results[0]?.geometry?.location;
          if (!position) throw new Error("ZERO_RESULTS");
          return { lat: position.lat(), lng: position.lng() };
        });
        const locating = runner.current.run(
          config.points,
          locate.current,
          update,
        );
        const markersLoaded = markerLibrary.then(() => {
          if (!disposed) setMarkerReady(true);
        });
        // Observe failures immediately while map creation proceeds independently.
        const pending = Promise.all([markersLoaded, locating]);
        void pending.catch((e) => {
          if (!disposed) setError(e.message);
        });
        const { Map } = await mapsLibrary;
        if (disposed) return;
        window.gm_authFailure = () => {
          if (!disposed)
            setError("API Key 验证失败，请检查密钥、计费和网站域名限制。");
        };
        map.current = new Map(host.current, {
          center: { lat: 35.68, lng: 139.76 },
          zoom: 11,
          isFractionalZoomEnabled: false,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
        });
        setMapConfig(config);
        await pending;
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      runner.current.cancel();
    };
  }, [config]);
  useEffect(() => {
    if (!map.current || mapConfig !== config || !markerReady) return;
    const g = window.google.maps,
      overlays: any[] = [],
      listeners: any[] = [];
    config.points.forEach((point, i) => {
      const position = results[i]?.position;
      if (!position) return;
      const el = document.createElement("div");
      el.className = "map-pin";
      const label = document.createElement("span");
      label.textContent = String(i + 1);
      el.append(label);
      overlays.push(
        new g.marker.AdvancedMarkerElement({
          map: map.current,
          position,
          content: el,
          title: `${i + 1}. ${point}`,
        }),
      );
      const next = results[i + 1]?.position;
      if (!next) return;
      const line = new g.Polyline({
        map: map.current,
        path: [position, next],
        geodesic: false,
        strokeColor: "#2f6da6",
        strokeWeight: selected === i ? 8 : 4,
        strokeOpacity: selected === null || selected === i ? 0.95 : 0.35,
      });
      listeners.push(line.addListener("click", () => setSelected(i)));
      overlays.push(line);
    });
    return () => {
      listeners.forEach((listener) => listener?.remove());
      overlays.forEach((o) => {
        if (o.setMap) o.setMap(null);
        else o.map = null;
      });
    };
  }, [results, selected, config, markerReady, mapConfig]);
  const resetZoom = useCallback(() => {
    if (!map.current) return;
    const positions = Object.values(results).flatMap((r) =>
      r.position ? [r.position] : [],
    );
    if (!positions.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    positions.forEach((p) => bounds.extend(p));
    if (
      positions.every(
        (p) => p.lat === positions[0].lat && p.lng === positions[0].lng,
      )
    ) {
      map.current.setCenter(positions[0]);
      map.current.setZoom(14);
    } else map.current.fitBounds(bounds, 60);
  }, [results]);
  const busy =
    Object.keys(results).length < config.points.length ||
    Object.values(results).some((r) => r.status === "loading");
  useLayoutEffect(() => {
    if (busy || !map.current || mapConfig !== config) return;
    const positions = Object.values(results).some((r) => r.position);
    if (!positions) return;
    const listener = map.current.addListener("idle", () => {
      setVisibleConfig(config);
      listener.remove();
    });
    resetZoom();
    return () => listener.remove();
  }, [busy, resetZoom, config, mapConfig]);
  const awaitingRegion = hasAddresses && visibleConfig !== config;
  const allFailed = !busy && !Object.values(results).some((r) => r.position);
  function showRoute(i: number) {
    if (!map.current || busy || error) return;
    const start = results[i]?.position,
      end = results[i + 1]?.position;
    const query = new URLSearchParams({
      key: config.key.trim(),
      origin: start ? `${start.lat},${start.lng}` : config.points[i].trim(),
      destination: end ? `${end.lat},${end.lng}` : config.points[i + 1].trim(),
      mode: "transit",
      zoom: String(
        Math.max(0, Math.min(21, Math.round(map.current.getZoom() ?? 11))),
      ),
      language: "zh-CN",
    });
    const center = map.current.getCenter();
    if (center) {
      query.set("center", `${center.lat()},${center.lng()}`);
    }
    const url = `https://www.google.com/maps/embed/v1/directions?${query}`;
    setSelected(i);
    setActiveRoute(url);
    // Keep mounted frames in insertion order: reordering iframes can reload them.
    // A bounded session cache avoids retaining a frame for every stop/zoom.
    setRouteFrames((frames) =>
      frames.some((f) => f.url === url)
        ? frames
        : [
            ...frames.slice(-5),
            {
              url,
              title: `公共交通路线：${config.points[i]} → ${config.points[i + 1]}`,
            },
          ],
    );
  }
  return (
    <main className="embed-map">
      <div
        className="google-map"
        ref={host}
        aria-label="行程地图"
        style={{
          visibility: activeRoute || awaitingRegion ? "hidden" : "visible",
        }}
      />
      {awaitingRegion && !error && !activeRoute && (
        <div className="map-loading" role="status" aria-live="polite">
          <div className="map-loading-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <strong>{allFailed ? "暂未定位到行程地点" : "正在定位行程…"}</strong>
          {allFailed && <span>展开行程连线查看详情并重试</span>}
        </div>
      )}
      {routeFrames.map((frame) => (
        <iframe
          key={frame.url}
          className="google-map route-frame"
          src={frame.url}
          title={frame.title}
          hidden={activeRoute !== frame.url}
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ))}
      <div className={`map-controls${activeRoute ? " route-controls" : ""}`}>
        {activeRoute ? (
          <button
            aria-label="返回总览"
            title="返回总览"
            onClick={() => {
              setActiveRoute(null);
              setSelected(null);
            }}
          >
            <MapIcon name="back" />
          </button>
        ) : (
          <button
            aria-label="重置缩放"
            title="重置缩放"
            onClick={resetZoom}
            disabled={busy || !Object.values(results).some((r) => r.position)}
          >
            <MapIcon name="fit" />
          </button>
        )}
        {!activeRoute && (
          <a
            aria-label="编辑行程 ↗"
            title="编辑行程（新窗口）"
            href={makeUrl(config, window.location.href, "editor")}
            target="_blank"
            rel="noreferrer"
          >
            <MapIcon name="edit" />
          </a>
        )}
      </div>
      {error && !activeRoute && (
        <div className="map-error" role="alert">
          <strong>地图暂时无法加载</strong>
          <p>{error}</p>
          <a
            target="_blank"
            rel="noreferrer"
            href={makeUrl(config, window.location.href, "editor")}
          >
            打开编辑器
          </a>
        </div>
      )}
      <details
        className="route-summary"
        hidden={!!activeRoute}
        open={selected !== null || undefined}
        onToggle={(e) => {
          if (!e.currentTarget.open) setSelected(null);
        }}
      >
        <summary
          aria-label={`行程连线 · ${config.points.length} 个图钉`}
          title="展开或收起行程连线"
        >
          <MapIcon name="route" />
          <span className="route-summary-copy">
            <strong>行程连线 · {config.points.length} 个图钉</strong>
            <span className="route-summary-status">
              {error ? "加载失败" : busy ? "定位中…" : "双击查看公共交通路线"}
            </span>
          </span>
        </summary>
        {config.points.map(
          (point, i) =>
            results[i]?.status === "error" && (
              <article className="result" key={`error-${i}`}>
                <strong>
                  地点 {i + 1} · {point}
                </strong>
                <p role="alert">{results[i].error}</p>
                <button
                  className="map-icon-button"
                  aria-label={`重试地点 ${i + 1}`}
                  title={`重试地点 ${i + 1}`}
                  disabled={busy}
                  onClick={() =>
                    locate.current &&
                    runner.current.run(config.points, locate.current, update, [
                      i,
                    ])
                  }
                >
                  <MapIcon name="retry" />
                </button>
              </article>
            ),
        )}
        {config.points.slice(1).map((p, i) => (
          <article
            className={`result ${selected === i ? "selected" : ""}`}
            key={i}
            onDoubleClick={() => showRoute(i)}
          >
            <button
              className="result-title"
              aria-label={`${i + 1} ${config.points[i]} 到 ${i + 2} ${p}`}
              onClick={() => setSelected(i)}
              title="双击查看公共交通路线，或按 Enter"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  showRoute(i);
                }
              }}
            >
              <span>
                {i + 1} {config.points[i]}
              </span>
              <span className="route-arrow" aria-hidden="true">
                →
              </span>
              <span>
                {i + 2} {p}
              </span>
            </button>
          </article>
        ))}
      </details>
    </main>
  );
}
