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
  const [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null);
  const update = (i: number, result: PointResult) =>
    setResults((prev) => ({ ...prev, [i]: result }));
  useEffect(() => {
    let disposed = false;
    setResults({});
    setError("");
    setSelected(null);
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
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "cooperative",
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
        strokeColor: "#315e45",
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
  return (
    <main className="embed-map">
      <div className="google-map" ref={host} aria-label="行程地图" />
      <div className="map-controls">
        <button
          onClick={resetZoom}
          disabled={!Object.values(results).some((r) => r.position)}
        >
          重置缩放
        </button>
        <a
          href={makeUrl(config, window.location.href, "editor")}
          target="_blank"
          rel="noreferrer"
        >
          编辑行程 ↗
        </a>
      </div>
      {error && (
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
        open={selected !== null || undefined}
        onToggle={(e) => {
          if (!e.currentTarget.open) setSelected(null);
        }}
      >
        <summary>
          行程连线 · {config.points.length} 个图钉
          <span>{error ? "加载失败" : busy ? "定位中…" : "展开查看"}</span>
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
          >
            <button
              className="result-title"
              aria-label={`${i + 1} ${config.points[i]} 到 ${i + 2} ${p}`}
              onClick={() => setSelected(i)}
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
