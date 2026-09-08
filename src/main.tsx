import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { parse, validate, makeUrl, readableUrl, type Config } from "./config";
import { MapView } from "./MapView";
import { loadApiKey, saveApiKey } from "./storage";
import "./style.css";
const parsed = parse(window.location.search);
const initial = {
  ...parsed,
  config: {
    ...parsed.config,
    key:
      parsed.config.key ||
      (parsed.config.view === "editor" ? loadApiKey() : ""),
  },
};
type Theme = "light" | "dark";

function App() {
  const [config, setConfig] = useState<Config>(initial.config),
    [errors, setErrors] = useState(initial.errors);
  const [preview, setPreview] = useState(""),
    [share, setShare] = useState(""),
    [copied, setCopied] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);
  const chineseShare = readableUrl(share);
  const [showKey, setShowKey] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("routeflow-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (config.view === "editor") saveApiKey(config.key);
  }, [config.key, config.view]);
  const set = (patch: Partial<Config>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setShare("");
    setCopied("");
  };
  function previewRoute() {
    const issues = validate(config);
    setErrors(issues);
    if (issues.length) return;
    const url = makeUrl(config, window.location.href);
    setPreview(url);
    setShare(url);
    setPreviewRevision((r) => r + 1);
  }
  function reorder(i: number, target: number) {
    if (target < 0 || target >= config.points.length || target === i) return;
    const points = [...config.points];
    points.splice(target, 0, points.splice(i, 1)[0]);
    set({ points });
  }
  function remove(i: number) {
    set({ points: config.points.filter((_, j) => j !== i) });
  }
  async function copy(text: string, kind: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`已复制${kind}`);
    } catch {
      setCopied("请从下方文本框手动复制");
    }
  }
  if (config.view === "embed") {
    const issues = [...initial.errors, ...validate(config)];
    if (issues.length)
      return (
        <div className="embed-invalid">
          <div className="logo">↗ RouteFlow</div>
          <h1>配置你的行程地图</h1>
          <ul>
            {[...new Set(issues)].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <a
            className="primary link-button"
            href={makeUrl(
              { ...config, view: "editor" },
              window.location.href,
              "editor",
            )}
          >
            打开地图编辑器
          </a>
        </div>
      );
    return <MapView config={config} />;
  }
  return (
    <div className="app-shell">
      <header>
        <a className="logo" href={window.location.pathname}>
          <span>↗</span> RouteFlow <small>MAP</small>
        </a>
        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={`切换到${theme === "dark" ? "浅色" : "深色"}模式`}
            title={`切换到${theme === "dark" ? "浅色" : "深色"}模式`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>
            {theme === "dark" ? "浅色" : "深色"}
          </button>
          <a
            className="github"
            href="https://github.com/EShuoTan-Labs/routeflow-map"
            target="_blank"
            rel="noreferrer"
          >
            使用指南 ↗
          </a>
        </div>
      </header>
      <section className="intro">
        <div>
          <div className="eyebrow">A LITTLE MAP. A BIG JOURNEY.</div>
          <p>标记途经地点，用直线串起旅程。为你的旅行文档，留一张行程地图。</p>
        </div>
        <span className="embed-badge">◇ 为 Notion 等文档而生</span>
      </section>
      <div className="workspace">
        <aside className="editor">
          <div className="section-heading">
            <h2>编排行程</h2>
            <span>01 — BUILD</span>
          </div>
          <label className="field-label" htmlFor="key">
            Google Maps API Key
          </label>
          <div className="key-input">
            <input
              id="key"
              type={showKey ? "text" : "password"}
              value={config.key}
              autoComplete="off"
              placeholder="粘贴你的浏览器 API Key"
              onChange={(e) => set({ key: e.target.value })}
            />
            <button
              aria-label={showKey ? "隐藏密钥" : "显示密钥"}
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
          <p className="hint">
            底图使用 Maps JavaScript API；地址定位使用 Geocoding
            API；公共交通路线使用 Maps Embed
            API。密钥保存在此浏览器并随嵌入链接共享，请设置域名限制。
          </p>
          <div className="stops-heading">
            <h3>途经地点</h3>
            <button
              className="text-button"
              onClick={() =>
                set({
                  points: [
                    "Hunters Point, San Francisco, CA 94124",
                    "201 Marine Dr, San Francisco, CA 94129",
                    "Palace of Fine Arts, San Francisco, CA 94123",
                  ],
                })
              }
            >
              载入旧金山示例 ↗
            </button>
          </div>
          <div className="stops">
            {config.points.map((point, i) => (
              <div
                key={i}
                data-stop-index={i}
                className={`stop ${dragged === i ? "dragging" : ""} ${dropTarget === i ? "drop-target" : ""}`}
              >
                <div className="stop-row">
                  <span
                    className="drag-handle"
                    role="button"
                    tabIndex={0}
                    aria-label={`拖动排序地点 ${i + 1}`}
                    title="拖动排序，或使用方向键调整"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDragged(i);
                      setDropTarget(i);
                    }}
                    onPointerMove={(e) => {
                      if (dragged === null) return;
                      const row = document
                        .elementFromPoint(e.clientX, e.clientY)
                        ?.closest<HTMLElement>("[data-stop-index]");
                      setDropTarget(row ? Number(row.dataset.stopIndex) : null);
                    }}
                    onPointerUp={() => {
                      if (dragged !== null && dropTarget !== null)
                        reorder(dragged, dropTarget);
                      setDragged(null);
                      setDropTarget(null);
                    }}
                    onLostPointerCapture={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        const target = i + (e.key === "ArrowUp" ? -1 : 1);
                        reorder(i, target);
                        if (target >= 0 && target < config.points.length)
                          document
                            .querySelector<HTMLElement>(
                              `[data-stop-index="${target}"] .drag-handle`,
                            )
                            ?.focus();
                      }
                    }}
                  >
                    ⋮⋮
                  </span>
                  <span className="stop-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <input
                    aria-label={`地点 ${i + 1}`}
                    value={point}
                    placeholder={
                      i === 0 ? "起点 · 地址或经纬度" : "下一站 · 地址或经纬度"
                    }
                    onChange={(e) =>
                      set({
                        points: config.points.map((p, j) =>
                          j === i ? e.target.value : p,
                        ),
                      })
                    }
                  />
                  <div className="stop-actions">
                    <button
                      disabled={config.points.length <= 2}
                      aria-label={`删除地点 ${i + 1}`}
                      onClick={() => remove(i)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            className="add-stop"
            onClick={() => set({ points: [...config.points, ""] })}
          >
            ＋ 添加途经点
          </button>
          <p className="hint">
            拖动地点左侧手柄调整顺序，图钉按列表顺序直线相连。
          </p>
          {errors.length > 0 && (
            <ul className="errors" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button className="primary preview-button" onClick={previewRoute}>
            预览地图 <span>→</span>
          </button>
        </aside>
        <section className="preview-area">
          <div className="preview-heading">
            <div>
              <span className="status-dot" />
              地图预览
            </div>
            <span>02 — EXPLORE</span>
          </div>
          <div className="preview-canvas">
            {preview ? (
              <iframe
                key={previewRevision}
                src={preview}
                title="行程地图预览"
                allowFullScreen
              />
            ) : (
              <div className="empty-map">
                <svg
                  className="map-art"
                  viewBox="0 0 700 500"
                  aria-hidden="true"
                >
                  <path
                    className="river"
                    d="M430 -20C250 130 600 140 410 300S300 430 370 520"
                  />
                  <g className="streets">
                    <path d="M0 90L700 290M0 240L700 440M100 0L20 500M290 0L200 500M600 0L510 500M0 390L700 30" />
                    <path d="M0 160L700 360M0 310L700 110M200 0L110 500M690 0L600 500" />
                  </g>
                  <path className="sample-route" d="M180 330L360 276L475 158" />
                  {[
                    [180, 330],
                    [360, 276],
                    [475, 158],
                  ].map(([x, y], i) => (
                    <g key={i}>
                      <circle cx={x} cy={y} r="16" />
                      <text x={x} y={y + 5}>
                        {i + 1}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="empty-card">
                  <span className="compass">↗</span>
                  <h2>下一站，去哪里？</h2>
                  <p>
                    添加密钥与地点，点击「预览地图」
                    <br />
                    你的旅程将在这里展开。
                  </p>
                  <small>背景为行程示意图</small>
                </div>
              </div>
            )}
          </div>
          <p className="hint map-caption">编号图钉 · 按顺序直线连接</p>
          <section className="share">
            <div>
              <div className="eyebrow">03 — SHARE</div>
              <h2>让地图成为文档的一部分</h2>
              <p>复制链接，在 Notion 中使用 /embed，即可嵌入这段旅程。</p>
            </div>
            <div className="share-actions">
              <button disabled={!share} onClick={() => copy(share, "链接")}>
                复制嵌入链接 ↗
              </button>
              <button
                disabled={!share}
                onClick={() =>
                  copy(
                    `<iframe src="${share.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" title="RouteFlow 行程地图" width="100%" height="480" style="border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe>`,
                    "iframe 代码",
                  )
                }
              >
                复制 iframe
              </button>
            </div>
            {share && <textarea aria-label="嵌入链接" readOnly value={share} />}
            {share && (
              <div className="readable-share">
                <div className="share-actions">
                  <label htmlFor="chinese-share">中文嵌入链接</label>
                  <button onClick={() => copy(chineseShare, "中文链接")}>
                    复制中文链接 ↗
                  </button>
                </div>
                <textarea id="chinese-share" readOnly value={chineseShare} />
              </div>
            )}
            <div role="status">{copied}</div>
          </section>
        </section>
      </div>
      <footer>
        <span>RouteFlow Map · 为每一段旅途留一张地图</span>
        <span>Google Maps 提供底图与地点定位</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
