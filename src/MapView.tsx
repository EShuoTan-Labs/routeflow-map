import { useCallback, useEffect, useRef, useState } from "react";
import { type Config, makeUrl } from "./config";
import { loadGoogle } from "./google";
import { PointRunner, type PointResult, type Locate } from "./routes";
export function MapView({ config }: { config: Config }) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null);
  const runner = useRef(new PointRunner()),
    locate = useRef<Locate | null>(null);
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
    setError("");
    setSelected(null);
    setActiveRoute(null);
    setRouteFrames([]);
    map.current = null;
    locate.current = null;
    loadGoogle(config.key)
      .then(async () => {
        const [{ Map }] = await Promise.all([
          window.google.maps.importLibrary("maps"),
          window.google.maps.importLibrary("marker"),
        ]);
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
        let geocoder: Promise<any> | undefined;
        locate.current = async (address) => {
          geocoder ??= window.google.maps
            .importLibrary("geocoding")
            .then(({ Geocoder }: any) => new Geocoder());
          const { results } = await (await geocoder).geocode({ address });
          const position = results[0]?.geometry?.location;
          if (!position) throw new Error("ZERO_RESULTS");
          return { lat: position.lat(), lng: position.lng() };
        };
        await runner.current.run(config.points, locate.current, update);
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
    if (!map.current) return;
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
  }, [results, selected, config]);
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
  useEffect(resetZoom, [resetZoom]);
  const busy =
    Object.keys(results).length < config.points.length ||
    Object.values(results).some((r) => r.status === "loading");
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
        style={{ visibility: activeRoute ? "hidden" : "visible" }}
      />
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
            onClick={() => {
              setActiveRoute(null);
              setSelected(null);
            }}
          >
            返回总览
          </button>
        ) : (
          <button
            onClick={resetZoom}
            disabled={!Object.values(results).some((r) => r.position)}
          >
            重置缩放
          </button>
        )}
        {!activeRoute && (
          <a
            href={makeUrl(config, window.location.href, "editor")}
            target="_blank"
            rel="noreferrer"
          >
            编辑行程 ↗
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
        <summary>
          行程连线 · {config.points.length} 个图钉
          <span>
            {error ? "加载失败" : busy ? "定位中…" : "双击查看公共交通路线"}
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
                  disabled={busy}
                  onClick={() =>
                    locate.current &&
                    runner.current.run(config.points, locate.current, update, [
                      i,
                    ])
                  }
                >
                  重试地点 {i + 1}
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
