import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  parse,
  validate,
  makeUrl,
  modes,
  transitModes,
  effective,
  type Config,
  type Mode,
  type Segment,
  type TransitMode,
} from "./config";
import { MapView, colors } from "./MapView";
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
  const [showKey, setShowKey] = useState(false);
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
  const segment = (i: number, patch: Segment) =>
    set({
      segments: {
        ...config.segments,
        [i]: { ...config.segments[i], ...patch },
      },
    });
  function previewRoute() {
    const issues = validate(config);
    setErrors(issues);
    if (issues.length) return;
    const url = makeUrl(config, window.location.href);
    setPreview(url);
    setShare(url);
    setPreviewRevision((r) => r + 1);
  }
  function reorder(i: number, delta: number) {
    const points = [...config.points];
    [points[i], points[i + delta]] = [points[i + delta], points[i]];
    set({ points });
  }
  function remove(i: number) {
    const segments: Config["segments"] = {};
    Object.entries(config.segments).forEach(([key, value]) => {
      const n = Number(key);
      if (n < i - 1) segments[n] = value;
      else if (n > i) segments[n - 1] = value;
    });
    set({ points: config.points.filter((_, j) => j !== i), segments });
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
            打开路线编辑器
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
          <p>步行穿过街巷，乘列车去下一站。为你的旅行文档，绘制每一段路。</p>
        </div>
        <span className="embed-badge">◇ 为 Notion 等文档而生</span>
      </section>
      <div className="workspace">
        <aside className="editor">
          <div className="section-heading">
            <h2>规划路线</h2>
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
            密钥会保存在此浏览器，并随嵌入链接共享；请设置网站域名限制。
          </p>
          <label className="field-label" htmlFor="default-mode">
            默认交通方式
          </label>
          <select
            id="default-mode"
            value={config.mode}
            onChange={(e) => set({ mode: e.target.value as Mode })}
          >
            {Object.entries(modes).map(([m, title]) => (
              <option key={m} value={m}>
                {title}
              </option>
            ))}
          </select>
          <div className="stops-heading">
            <h3>途经地点</h3>
            <button
              className="text-button"
              onClick={() =>
                set({
                  points: [
                    "东京站, 东京都千代田区丸之内1丁目, 日本",
                    "浅草寺, 东京都台东区浅草2丁目3-1, 日本",
                    "东京晴空塔, 东京都墨田区押上1丁目1-2, 日本",
                  ],
                  segments: { "1": { mode: "walking" } },
                })
              }
            >
              载入东京示例 ↗
            </button>
          </div>
          <div className="stops">
            {config.points.map((point, i) => (
              <div key={i} className="stop">
                <div className="stop-row">
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
                      disabled={i === 0}
                      aria-label={`上移地点 ${i + 1}`}
                      onClick={() => reorder(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === config.points.length - 1}
                      aria-label={`下移地点 ${i + 1}`}
                      onClick={() => reorder(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      disabled={config.points.length <= 2}
                      aria-label={`删除地点 ${i + 1}`}
                      onClick={() => remove(i)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {i < config.points.length - 1 && (
                  <div className="segment">
                    <span className="segment-line" />
                    <select
                      aria-label={`第 ${i + 1} 段交通方式`}
                      value={config.segments[i]?.mode || ""}
                      onChange={(e) =>
                        segment(i, {
                          mode: (e.target.value || undefined) as
                            Mode | undefined,
                          transitModes: undefined,
                        })
                      }
                    >
                      <option value="">
                        默认 · {modes[config.mode] || "请选择"}
                      </option>
                      {Object.entries(modes).map(([m, title]) => (
                        <option value={m} key={m}>
                          {title}
                        </option>
                      ))}
                    </select>
                    {effective(config, i).mode === "transit" && (
                      <select
                        aria-label={`第 ${i + 1} 段公交偏好`}
                        value={config.segments[i]?.transitModes?.[0] || ""}
                        onChange={(e) =>
                          segment(i, {
                            transitModes: e.target.value
                              ? [e.target.value as TransitMode]
                              : undefined,
                          })
                        }
                      >
                        <option value="">公交偏好 · 不限</option>
                        {Object.entries(transitModes).map(([m, title]) => (
                          <option key={m} value={m}>
                            {title}优先
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
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
            各段可单独设置交通。调整顺序后，交通设置仍对应路段序号。
          </p>
          {errors.length > 0 && (
            <ul className="errors" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button className="primary preview-button" onClick={previewRoute}>
            预览路线 <span>→</span>
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
                  <path
                    className="sample-route"
                    d="M180 330L230 240L360 276L475 158"
                  />
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
                    添加密钥与地点，点击「预览路线」
                    <br />
                    你的旅程将在这里展开。
                  </p>
                  <small>背景为路线示意图</small>
                </div>
              </div>
            )}
          </div>
          <div className="legend">
            {Object.entries(modes).map(([m, title]) => (
              <span key={m}>
                <i style={{ background: colors[m as Mode] }} />
                {title}
              </span>
            ))}
            <small>公共交通按查询时刻独立规划</small>
          </div>
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
            <div role="status">{copied}</div>
          </section>
        </section>
      </div>
      <footer>
        <span>RouteFlow Map · 为每一段旅途留一张地图</span>
        <span>Google Maps 提供地图与路线数据</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
