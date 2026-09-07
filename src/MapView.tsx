import { useEffect, useRef, useState } from "react";
import { type Config, effective, modes, makeUrl } from "./config";
import { loadGoogle } from "./google";
import { RouteRunner, type Result, type Compute } from "./routes";
export const colors = {
  transit: "#5468df",
  walking: "#c88736",
  driving: "#2b8276",
  bicycling: "#b45680",
};
export function MapView({ config }: { config: Config }) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    overlays = useRef<any[]>([]);
  const runner = useRef(new RouteRunner()),
    compute = useRef<Compute | null>(null);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null);
  const update = (i: number, result: Result) =>
    setResults((prev) => ({ ...prev, [i]: result }));
  useEffect(() => {
    let disposed = false;
    loadGoogle(config.key)
      .then(async () => {
        const [{ Map }, { Route }] = await Promise.all([
          window.google.maps.importLibrary("maps"),
          window.google.maps.importLibrary("routes"),
          window.google.maps.importLibrary("marker"),
        ]);
        if (disposed) return;
        window.gm_authFailure = () =>
          setError("API Key 验证失败，请检查密钥、计费和网站域名限制。");
        map.current = new Map(host.current, {
          center: { lat: 35.68, lng: 139.76 },
          zoom: 11,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "cooperative",
        });
        compute.current = (request) => Route.computeRoutes(request);
        await runner.current.run(config, compute.current, update);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      runner.current.cancel();
      overlays.current.forEach((o) => {
        if (o.setMap) o.setMap(null);
        else o.map = null;
      });
    };
  }, [config]);
  useEffect(() => {
    if (!map.current) return;
    overlays.current.forEach((o) => {
      if (o.setMap) o.setMap(null);
      else o.map = null;
    });
    overlays.current = [];
    const g = window.google.maps,
      bounds = new g.LatLngBounds(),
      markers = new Map<number, any>();
    Object.entries(results).forEach(([key, result]) => {
      const i = Number(key),
        path = result.route?.path;
      if (!path?.length) return;
      // Route.path uses LatLngAltitude values (numeric lat/lng), compatible with LatLngLiteral.
      const line = new g.Polyline({
        map: map.current,
        path,
        strokeColor: colors[effective(config, i).mode],
        strokeWeight: selected === i ? 8 : 5,
        strokeOpacity: selected === null || selected === i ? 0.95 : 0.4,
      });
      line.addListener("click", () => setSelected(i));
      overlays.current.push(line);
      path.forEach((p) => bounds.extend(p));
      markers.set(i, path[0]);
      markers.set(i + 1, path[path.length - 1]);
    });
    markers.forEach((position, i) => {
      const el = document.createElement("div");
      el.className = "map-pin";
      el.textContent = String(i + 1);
      overlays.current.push(
        new g.marker.AdvancedMarkerElement({
          map: map.current,
          position,
          content: el,
          title: `${i + 1}. ${config.points[i]}`,
        }),
      );
    });
    if (!bounds.isEmpty() && selected === null)
      map.current.fitBounds(bounds, 60);
  }, [results, selected, config]);
  const busy = Object.values(results).some((r) => r.status === "loading");
  return (
    <main className="embed-map">
      <div className="google-map" ref={host} aria-label="行程地图" />
      <div className="map-brand">
        ↗ <b>RouteFlow</b>
        <span>旅途，每一段都有方向</span>
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
          路线详情 · {config.points.length - 1} 段{" "}
          <span>{busy ? "查询中…" : "展开查看"}</span>
        </summary>
        <p className="muted">
          各段按当前时间独立查询，交通偏好以实际返回线路为准。
        </p>
        {config.points.slice(1).map((p, i) => {
          const r = results[i];
          return (
            <article
              className={`result ${selected === i ? "selected" : ""}`}
              key={i}
            >
              <button className="result-title" onClick={() => setSelected(i)}>
                <i style={{ background: colors[effective(config, i).mode] }} />
                {i + 1} → {i + 2} · {modes[effective(config, i).mode]}
              </button>
              <div className="result-place">
                {config.points[i]} → {p}
              </div>
              <p>
                {!r || r.status === "loading"
                  ? "正在寻找路线…"
                  : r.status === "error"
                    ? r.error
                    : `${((r.route?.distanceMeters || 0) / 1000).toFixed(1)} 公里 · 约 ${Math.ceil((r.route?.durationMillis || 0) / 60000)} 分钟`}
              </p>
              {r?.route?.legs
                ?.flatMap((l) => l.steps || [])
                .filter((s) => s.transitDetails)
                .map((s, j) => (
                  <div className="transit-line" key={j}>
                    {s.transitDetails?.transitLine?.shortName ||
                      s.transitDetails?.transitLine?.name}
                    {s.transitDetails?.transitLine?.agencies?.map((a, k) => (
                      <span key={k}>
                        {" "}
                        ·{" "}
                        {a.url && /^https?:\/\//.test(String(a.url)) ? (
                          <a
                            href={String(a.url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {a.name}
                          </a>
                        ) : (
                          a.name
                        )}
                      </span>
                    ))}
                  </div>
                ))}
              {r?.route?.warnings?.map((w, j) => (
                <p className="warning" key={j}>
                  {w}
                </p>
              ))}
              {r?.status === "error" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    compute.current &&
                    runner.current.run(config, compute.current, update, [i])
                  }
                >
                  重试此段
                </button>
              )}
            </article>
          );
        })}
      </details>
      {Object.values(results).flatMap((r) => r.route?.warnings || []).length >
        0 && (
        <div className="map-warnings">
          {[
            ...new Set(
              Object.values(results).flatMap((r) => r.route?.warnings || []),
            ),
          ].map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </main>
  );
}
