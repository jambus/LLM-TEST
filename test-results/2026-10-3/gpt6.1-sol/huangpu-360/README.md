# 浦江 · 360° 高空漫游

静态 H5 三维地图，无需 API Key。通过 HTTP 服务打开 `dist/index.html`；直接通过 `file://` 打开不能加载本地 JSON。地图在线加载 OpenFreeMap 矢量瓦片，因此需要网络访问。

功能：360° 方位旋转、俯仰与缩放、环视/平移手势切换、昼夜模拟、自动环绕、沿真实黄浦江中心线巡游、五个观景点、四个陆家嘴地标、移动设备布局及键盘操控。

## 数据依据和精度

- 地理坐标 WGS84；地面按 0 m 平面呈现，未接入实测地形。
- 底图由 OpenFreeMap / OpenMapTiles 提供，原始数据来自 OpenStreetMap。
- `dist/scene-data.json` 包含原始 OSM 地标建筑分部的真实轮廓及高度标签，以及黄浦江 way 47088277 的实际中心线，截取杨浦—徐汇沿江段。
- `source-data/` 保存 2026-10-03 下载的原始 OSM 快照（gzip）。`scripts/extract-osm.py` 可重新提取数据。数据来源 URL、OSM ID、坐标基准、估算标记保存在 JSON 中。
- 地标总高度：上海中心 632 m（上海中心官网）；环球金融中心 492 m（官方新闻资料）；金茂 420.5 m（CTBUH）；东方明珠 468 m（上海档案信息网）。地标公开总高度是信息标签，建筑分部高度沿用 OSM 标签，部分是贡献者估算。
- 普通建筑 `render_height` 可能来自高度、楼层或默认规则。模型为垂直拉伸的简化建筑分部，未复原立面或曲面，不应当作实测或摄影测量模型。
- 夜景采用模拟色彩及光带，不表示真实现场、实时灯光、日照计算或时间状态。夜景光带外扩 1.2% 避免共面闪烁，属于渲染效果。

地图及派生地理数据 © OpenStreetMap 贡献者，依据 [ODbL 1.0](https://www.openstreetmap.org/copyright) 发布。通过页面归属链接和数据说明展示许可。MapLibre GL JS 5.7.1 已保留分发文件中的许可证声明，库采用 BSD-3-Clause。

## 运行

```sh
python3 -m http.server 4173 --directory dist
```

在浏览器访问 http://localhost:4173/ 。

源文件 `dist/index.html`、`dist/style.css`、`dist/app.js`；Sites 静态发布配置 `.openai/hosting.json`。支持特征检测后的 WebMCP 昼夜切换及观景点导航工具。
