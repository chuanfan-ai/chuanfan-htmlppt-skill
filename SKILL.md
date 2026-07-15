---
name: chuanfan-htmlppt-skill
description: 生成、修改和验收可本地演示与安全编辑的横向 HTMLPPT。提供电子杂志、瑞士国际主义、船帆大会培训三种独立模板；支持飞书内容顺序忠实重构、提示词逐字保护、链接可点击、图片和视频原比例、文字/图片编辑删除拖动缩放、字号颜色单行、当前页历史、整套备份、重置、恢复原稿及用户最新保存态保护。用户要求制作或修改网页 PPT、培训课件、大会分享、HTML slide deck，或处理现有 HTMLPPT 编辑器时使用。
---

# Chuanfan HTMLPPT Skill

生成的是可直接在浏览器演示、可安全迭代的单文件 HTMLPPT。内容、视觉、交互和用户最新修改同等重要；不能为了重做设计覆盖用户已经保存的文字、图片和位置。

## 1. 三种风格

### 风格 A：电子杂志 × 电子墨水

- 模板：`assets/template.html`
- 适合：品牌叙事、观点演讲、视觉化长文、电影感发布。
- 必读：`references/layouts.md`、`references/themes.md`。

### 风格 B：瑞士国际主义

- 模板：`assets/template-swiss.html`
- 适合：设计系统、产品发布、结构化报告、强网格演示。
- 必读：`references/swiss-layout-lock.md`、`references/layouts-swiss.md`、`references/themes-swiss.md`。

### 风格 C：船帆大会培训

- 模板：`assets/template-conference.html`
- 适合：学校/企业培训、大会分享、AI 方法教学、工具教程、截图/提示词/案例/视频密集的长篇 deck。
- 默认：浅色教学页为主，深色只承担封面、转场、关键判断和金句。
- 船帆本人且未指定其他风格时优先使用 C。
- 必读：`references/style-c-conference-training.md`、`references/chuanfan-brand.md`。

三种模板互相独立。只使用当前模板中已经定义的类，不能跨风格复制类名。

## 2. 执行前必须读取

每次任务都完整读取：

1. `references/local-editor-contract.md`
2. `references/checklist.md`
3. 当前选择的风格规范和模板

满足以下条件时再读取：

- 来源是飞书文档、用户要求按原顺序或存在逐字提示词：`references/feishu-content-contract.md`
- 需要截图画布适配：`references/screenshot-framing.md`
- 需要生成配图：`references/image-prompts.md`
- 需要 Swiss 地图：`references/swiss-map-component.md`

## 3. 需求判断

先确认或从上下文可靠推断：

- 新建还是修改现有 deck。
- 演示比例；未说明时使用 16:9。
- 风格 A、B 或 C。
- 内容来源及其优先级。
- 是否有客户 VI/KV；没有时风格 C 使用船帆品牌。
- 是否必须保留全部文字、提示词、链接、图片和视频。
- 是否要求现场编辑与刷新恢复；本 Skill 默认保留完整编辑器。

用户已经给出明确选择时不要重复追问。修改现有 deck 时先读取真实文件和用户状态，再决定最小改动。

## 4. 用户最新修改保护（P0）

修改任何已有 HTMLPPT 前：

1. 查找同目录 `htmlppt-user-state.json`。
2. 检查浏览器最新保存态是否已落盘；必要时先让统一编辑器执行“保存到 PPT 文件夹”。
3. 创建整套 PPT 备份。
4. 以最新保存态为基底增量修改。
5. 保留文字、图片、位置、尺寸、字号、颜色、单行状态、删除状态和新增元素。

绝对禁止：

- 用旧 `index.html` 整页覆盖用户已经保存的新内容。
- 因 schema、模板或源码 revision 变化直接清空 `localStorage`。
- 重新实现一套功能更少的编辑器覆盖统一核心。

完整迁移与恢复语义见 `references/local-editor-contract.md`。

## 5. 飞书来源模式（P0）

船帆本人说“按我的飞书文档做”时自动启用：

1. 飞书文档决定内容和顺序。
2. 内容尽可能全部保留，主要任务是视觉重构。
3. 只有明显错误可以无歧义修正；可能改变观点的内容先保留。
4. 提示词、代码、JSON、命令、参数和其中链接逐字保留，一个字符都不能改。
5. 原文 URL 转为可直接打开的新标签页链接。
6. 案例优先同页呈现“案例名称 + 金句/判断 + 视频或图片 + 迁移启发”。
7. 图片和视频按源比例显示，不拉伸、不强制改成 16:9。

动手排版前建立 `source-manifest.json`，页面使用 `data-source-order`，逐字块使用 `data-verbatim-id`；交付前运行 `scripts/validate-deck.mjs`。

## 6. 生成流程

### 6.1 复制模板

```bash
# 风格 A
cp <SKILL_ROOT>/assets/template.html <DECK_DIR>/index.html

# 风格 B
cp <SKILL_ROOT>/assets/template-swiss.html <DECK_DIR>/index.html

# 风格 C
cp <SKILL_ROOT>/assets/template-conference.html <DECK_DIR>/index.html
```
模板是完整单文件 HTML，页面插入到 `<!-- SLIDES_HERE -->`。先读取模板完整 `<style>` 和现有页面结构，再写 slide。

### 6.2 规划页面

在写 HTML 前列出：

- 来源顺序 → 页码映射。
- 每页一句主结论。
- 页面任务 → 版式 → 明暗 → 主视觉 → 选择理由。
- 提示词逐字块、链接和媒体清单。
- 内容过密时的拆页位置。

观众可见文案必须是 takeaway、方法、判断或行动，不写“本页放一张图”“原文保留”“适合复制”等制作说明。

### 6.3 写页面

- 每页 `<section class="slide">` 带稳定 `data-slide-id` 和 `data-title`。
- 来源页再加 `data-source-order` 与 `data-source-section`。
- 提示词/代码块加 `data-verbatim-id`。
- 外部链接使用真实 `<a target="_blank" rel="noopener noreferrer">`。
- 图片写有意义的 `alt`。
- 当前模板缺少通用组件时，在模板 CSS 区统一增加，不在每页重复 inline 大段样式。

### 6.4 媒体规则

用户提供的证据素材：

- 图片、截图、海报、二维码：保持源比例，默认 `object-fit: contain`。
- 视频：读取 `video.videoWidth / video.videoHeight`，同步外层 `.video-natural` 比例。
- 不裁掉文字，不拉伸，不按文件名猜比例。

专门生成的装饰图或背景图可以按版式槽位使用标准比例和 `cover`。不要把这条规则套到用户原始证据素材上。

### 6.5 同步统一编辑器

编辑器只有两个源文件：

- `assets/editor-core.css`
- `assets/editor-core.js`

修改它们后必须运行：

```bash
python3 scripts/sync-editor-core.py
python3 scripts/sync-editor-core.py --check
```

三个模板中的内联副本必须与核心 hash 一致，不能分别手改。

## 7. 统一编辑器功能契约

三个模板必须稳定提供：

- 编辑模式：只由按钮进入和退出；按 `E` 不退出。
- 键盘隔离：编辑态左右键、空格、PageUp/PageDown、滚轮和触屏不翻页。
- 文字：修改、拖动、缩放、字号、颜色、单行显示、删除。
- 图片：替换、新增、拖动、缩放、删除，保持比例。
- 添加文本：默认透明背景。
- 历史：当前页历史与整套 PPT 备份分开显示、可点击恢复。
- 恢复：重置当前页、恢复原稿，恢复前自动备份当前状态。
- 保存：浏览器刷新恢复；本地服务可把最新状态原子写入 `htmlppt-user-state.json`。
- 保护：源码升级迁移用户状态，不清空旧数据。

编辑器界面预设五种常用颜色：`#090909`、`#1677ff`、`#ff7a00`、`#525252`、`#ffffff`。

## 8. 本地预览和持久化

在 deck 目录启动：

```bash
python3 <SKILL_ROOT>/scripts/local-edit-server.py --deck-dir . --port 17777
```

打开 `http://127.0.0.1:17777/index.html`。服务只在当前 deck 目录写入：

- `images/user-edits/`：新增或替换图片，按内容 hash 去重。
- `htmlppt-user-state.json`：最新状态包，临时文件写完后原子替换。

纯 `file://` 仍可演示和使用浏览器存储，但无法可靠把图片与状态写回项目目录。

## 9. 验收

交付前必须执行：

```bash
python3 scripts/sync-editor-core.py --check
node scripts/validate-deck.mjs <DECK_DIR>/index.html --manifest <DECK_DIR>/source-manifest.json
node tests/editor-contract.test.mjs
```

如果项目没有来源清单，可以省略 `--manifest`，但不能省略结构和编辑器校验。

真实浏览器至少检查 1920×1080、1440×900、1366×768：

- 封面、密集正文、截图、提示词、视频、二维码/行动页。
- 左上标签、右上说明、导航、页码和底部安全区。
- 标题孤行、溢出、重叠、媒体比例和可读字号。
- 编辑态输入 `E`、左右键和空格。
- 文字/图片删除、添加、拖动、缩放、颜色、保存、刷新、历史、重置和恢复。

验收失败就继续修复，不能只说明“理论上可用”。

## 10. 资源导览

```text
assets/
  template.html                  风格 A
  template-swiss.html            风格 B
  template-conference.html       风格 C
  editor-core.css                编辑器 CSS 单一事实来源
  editor-core.js                 编辑器 JS 单一事实来源
scripts/
  sync-editor-core.py            同步核心到三个单文件模板
  local-edit-server.py           本地图片与状态持久化服务
  validate-deck.mjs              结构、顺序、逐字块和链接校验
tests/
  editor-contract.test.mjs       真实浏览器交互回归
references/
  local-editor-contract.md       编辑、历史、恢复和迁移 P0 契约
  feishu-content-contract.md     飞书顺序、内容和逐字保护
  chuanfan-brand.md              个人网站品牌变量与使用规则
  style-c-conference-training.md 风格 C 完整规范
  checklist.md                   交付质量门禁
```
