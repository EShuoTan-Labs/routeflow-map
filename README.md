# RouteFlow Map

为旅行文档绘制混合交通路线。通过编辑器生成 URL，在 Notion 或支持 iframe 的文档中嵌入 Google 地图。

**在线编辑器：<https://eshuotan-labs.github.io/routeflow-map/>**

## 开始使用

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目并关联计费账户，启用 **Maps JavaScript API** 和 **Routes API**。
2. 创建浏览器 API Key。应用限制选择「网站」，添加 `https://eshuotan-labs.github.io/*`；本地调试可另外添加 `http://127.0.0.1:5173/*`。API 限制仅允许 Maps JavaScript API 和 Routes API。参考 [Google 密钥安全指南](https://developers.google.com/maps/api-security-best-practices)。
3. 在编辑器填写 Key 和至少两个地点。地点可以是完整地址，也可以是 `纬度,经度`，例如 `35.6812,139.7671`。地址建议包含城市。
4. 设置默认交通方式，并按需为各段设置覆盖值和公交偏好。调整地点顺序时交通配置保持对应路段序号；删除地点时，新合并的路段使用默认交通。
5. 点击「预览路线」，然后复制嵌入链接。修改后再次点击预览即可生成新链接。
6. 在 Notion 输入 `/embed`，粘贴链接并确认，拖动嵌入块调整高度，建议至少 400px。其他网站可复制 iframe 代码。

Key 会出现在分享 URL 中，收到链接的人能够读取它。请使用专用且限制域名/API 的浏览器 Key，并在 Cloud Console 设置配额与预算提醒。应用将 Key 交给 Google SDK，不写入仓库、localStorage 或服务端数据库。网页使用严格跨域 referrer 策略，跨域请求仅携带源站信息。

## URL 接口

所有参数位于查询字符串，由 `URLSearchParams` 编码。使用相同入口文件，适配 GitHub Pages 子路径。

| 参数       | 含义                                         | 默认值       |
| ---------- | -------------------------------------------- | ------------ |
| `view`     | `editor` 编辑器、`embed` 嵌入地图            | `editor`     |
| `key`      | Google 浏览器 API Key                        | 必填后可查询 |
| `mode`     | `transit`、`walking`、`driving`、`bicycling` | `transit`    |
| `point`    | 地点，重复传入，按出现顺序排列               | 至少两个     |
| `segments` | 以从 0 开始的路段索引为键的 JSON 对象        | `{}`         |

`segments` 中每段允许 `mode` 和 `transitModes`。`transitModes` 为数组，可选 `bus`、`subway`、`train`、`light_rail`、`rail`，仅在该段最终交通方式为公共交通时传给 Google。编辑器支持单一偏好，URL 支持多个偏好。

### 混合交通示例

以下代码可在你自己的 JavaScript 中生成链接（将占位符换成你的 Key）：

```js
const url = new URL("https://eshuotan-labs.github.io/routeflow-map/");
url.searchParams.set("view", "embed");
url.searchParams.set("key", "YOUR_GOOGLE_MAPS_KEY");
url.searchParams.set("mode", "transit");
["东京站", "浅草寺，东京", "东京晴空塔", "上野站，东京"].forEach((p) =>
  url.searchParams.append("point", p),
);
url.searchParams.set(
  "segments",
  JSON.stringify({
    0: { mode: "transit", transitModes: ["subway"] },
    1: { mode: "walking" },
  }),
);
console.log(url.href);
```

第 1 段为地铁偏好的公共交通，第 2 段步行，第 3 段继承公共交通默认值。

经纬度直填示例：

```text
https://eshuotan-labs.github.io/routeflow-map/?view=embed&key=YOUR_GOOGLE_MAPS_KEY&mode=walking&point=35.6812%2C139.7671&point=35.6852%2C139.7528
```

## 路线行为

使用 Maps JavaScript API Routes Library 的 `Route.computeRoutes`，将 A→B→C 拆成 A→B、B→C 独立查询，并在同一地图绘制。最多同时查询 3 段，选择 Google 返回的首条路线；单段失败可重试，其余成功结果保留。编辑器仅在点击预览时触发查询；嵌入页打开时自动查询。地图显示路线编号、距离、预计耗时、公共交通线路及提供方，点击路线可展开详情。

公共交通使用查询时刻，所有路段独立计算。预计耗时是每段参考值，行程衔接需结合实际时间安排。公交、地铁、火车等设置属于偏好，Google 可能返回包含其他交通方式的路线。覆盖范围、运营时刻和配额会影响结果。每次打开地图将产生地图加载和各段路线查询，计费以 Google Cloud 账户为准。

参考：[公共交通路线与偏好](https://developers.google.com/maps/documentation/javascript/routes/route-transit)、[Route API 参考](https://developers.google.com/maps/documentation/javascript/reference/route)。

## 本地开发与部署

需要 Node.js 22.12+ 或 24。

```sh
npm ci
npm run dev
npm test
npm run build
```

在 GitHub 仓库 Settings → Pages 中选择 **GitHub Actions**。推送到 `main` 后，工作流执行测试与构建，并发布 `dist`；Pull Request 仅执行验证。构建使用相对资源路径，支持项目子目录和自定义域名。生产站点不需要后端或服务器环境变量。

## 验证

自动测试覆盖 URL 编解码、中文地址、经纬度、默认继承、覆盖值校验、分段请求、三路并发、部分失败、重试和过期响应隔离。真实路线验收需要有效 Google Key：分别检查驾车/步行混合路线、三个地点的公共交通路线、点击详情、无路线和配额错误。Notion 验收需将生成链接放入实际文档嵌入块，检查窄宽布局与地图操作。
