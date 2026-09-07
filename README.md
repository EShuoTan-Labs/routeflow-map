# RouteFlow Map

为文档绘制行程地图：用编号图钉标记地点，按顺序用直线连接。通过编辑器生成链接，在 Notion 或其他支持 iframe 的文档中嵌入 Google 地图。

**在线编辑器：<https://eshuotan-labs.github.io/routeflow-map/>**

## 开始使用

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目并关联计费账户，启用 **Maps JavaScript API** 和 **Maps Embed API**。使用地址输入时，同时启用 **Geocoding API**。
2. 创建浏览器 API Key，应用限制选择「网站」，添加 `https://eshuotan-labs.github.io/*`，并将 API 限制设为所需服务。
3. 在编辑器填写 Key 和至少两个地点。支持完整地址或 `纬度,经度`，拖动地点左侧手柄调整顺序。
4. 点击「预览地图」，查看编号图钉和直线连线，然后复制嵌入链接。修改后再次预览即可生成新链接。
5. 在 Notion 输入 `/embed`，粘贴链接并确认，建议嵌入高度至少 400px。其他网站可复制 iframe 代码。

Key 会保存在当前浏览器的 `localStorage` 中，方便下次打开编辑器时自动填写；清空 Key 输入框会同时删除本地保存值。Key 也会出现在分享 URL 中，收到链接的人能够读取它。请使用专用且限制域名/API 的浏览器 Key，并在 Cloud Console 设置配额与预算提醒。应用不会将 Key 写入仓库或服务端数据库。网页使用严格跨域 referrer 策略，跨域请求仅携带源站信息。

## URL 接口

所有参数位于查询字符串，由 `URLSearchParams` 编码，支持 GitHub Pages 子路径。

| 参数    | 含义                                   | 默认值   |
| ------- | -------------------------------------- | -------- |
| `view`  | `editor` 编辑器、`embed` 嵌入地图      | `editor` |
| `key`   | Google 浏览器 API Key                  | 必填     |
| `point` | 地址或经纬度，重复传入，按出现顺序排列 | 至少两个 |

### 经纬度示例

将 `YOUR_GOOGLE_MAPS_KEY` 替换为你的 Key：

```text
https://eshuotan-labs.github.io/routeflow-map/?view=embed&key=YOUR_GOOGLE_MAPS_KEY&point=35.6812%2C139.7671&point=35.7148%2C139.7967&point=35.7101%2C139.8107
```

地址示例：`point=东京站&point=浅草寺，东京&point=东京晴空塔`。地址越完整，定位越明确。

## 地图行为

每个地点独立显示编号图钉；相邻且定位成功的地点使用统一颜色的直线连接。点击连线或路线详情可以高亮该段，详情按起点编号与名称、箭头、终点编号与名称分三行展示。嵌入页提供“重置缩放”按钮以显示完整行程，并可通过“编辑行程”携带当前配置打开编辑器。

双击列表项（键盘可按 Enter）查看该段公共交通实际路线，使用 Maps Embed API 的 `directions` 模式与 `mode=transit`。打开时沿用总览当前的中心位置和缩放级别；点击“返回总览”恢复保留的总览视图。路线页面按需加载，当前页面最多保留六个路线/中心/缩放组合的 iframe，重复查看缓存项直接显示原 iframe；超出容量、中心或缩放变化或刷新页面后可能重新加载。Google iframe 内的手动缩放由 Google 管理，返回总览时保留总览原来的缩放。

经纬度直接用于绘图。地址通过地理编码获取位置，每次定位最多并发处理三个地点，同一批中的重复地址共享定位请求。某个地点失败时，成功定位的图钉继续显示；重试成功后补齐与相邻地点的连线。

编辑器在点击预览后加载地图，嵌入页打开时自动加载。地图加载与地址定位的计费以 Google Cloud 账户为准。

参考：[Google 地理编码服务](https://developers.google.com/maps/documentation/javascript/geocoding)。

## 开发与验证

```sh
npm install
npm run dev
npm test
npm run build
```

自动测试覆盖 URL 编解码、地址与经纬度校验、地点定位、重复地址、并发限制、失败重试、过期结果隔离、图钉编号、相邻直线连接、连线选择和图层清理。地图渲染测试使用模拟 Google SDK；实际底图和地址定位需使用有效 Key 验证。

## 发布

推送到 `main` 后，GitHub Actions 会自动安装依赖、执行测试、构建并部署到 GitHub Pages。可在仓库的 Actions 页面查看 `Deploy GitHub Pages` 工作流，部署完成后访问上方在线编辑器。
