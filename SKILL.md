---
name: chuanfan-htmlppt-skill
description: 生成、修改和验收横向 HTMLPPT 的内容、结构与视觉，提供电子杂志、瑞士国际主义、船帆大会培训三种独立模板；支持飞书内容顺序忠实重构、提示词逐字保护、链接可点击、图片和视频原比例及用户最新保存态保护。所有通用演示、页面内编辑、保存和版本恢复功能必须调用独立的 htmlppt-interaction-editor Skill 安装，不在本 Skill 内重复实现。用户要求制作或修改网页 PPT、培训课件、大会分享或 HTML slide deck 时使用。
---

# Chuanfan HTMLPPT Skill

生成的是可直接在浏览器演示、可安全迭代的 HTMLPPT。这个 Skill 负责内容、结构与视觉；通用演示和编辑交互由独立的 `htmlppt-interaction-editor` Skill 负责。不能为了重做设计覆盖用户已经保存的文字、图片和位置。

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

1. `references/checklist.md`
2. 当前选择的风格规范和模板
3. 独立 `htmlppt-interaction-editor` Skill 的 `SKILL.md`

满足以下条件时再读取：

- 来源是飞书文档、用户要求按原顺序或存在逐字提示词：`references/feishu-content-contract.md`
- 需要截图画布适配：`references/screenshot-framing.md`
- 需要生成配图：`references/image-prompts.md`
- 需要 Swiss 地图：`references/swiss-map-component.md`
- 需要迁移旧版内嵌编辑器或旧状态：`references/local-editor-contract.md`

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

最新交互、保存和恢复语义以独立 `htmlppt-interaction-editor` Skill 为准；旧项目迁移补充见 `references/local-editor-contract.md`。

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

配图按以下顺序路由：

1. 用户提供的原图、截图、二维码、视频和证据素材。
2. 有明确来源的官方或公开素材；保留来源 URL，不用生成图冒充真实事件、人物、产品或机构。
3. 流程、数据、对比和系统关系优先使用可编辑 HTML/CSS/SVG。
4. 只有封面、章节主视觉、抽象概念和氛围场景再调用图片生成模型。

需要生成配图时完整读取 `references/image-prompts.md`，并遵守：

- 图片供应商与模型由当前运行环境或用户明确指定，Skill 不擅自切换供应商。
- 用户指定供应商后，失败时只能重试、使用已有素材或改为可编辑图形；禁止静默回退到其他付费图片模型。
- 生成图默认不承载标题、正文、数据标签和流程文字；这些内容留在 HTML 中，保证中文准确和可编辑。
- 先决定页面槽位和比例，再生成或选择图片，不把生成结果硬塞进不匹配的容器。
- 自动化运行时为生成或联网取得的素材写入 `asset-manifest.json`，至少记录页码、来源类型、来源 URL 或模型、提示词、比例、文件路径和失败回退。

### 6.5 调用独立交互编辑器

页面内容和视觉完成后，必须调用 `htmlppt-interaction-editor` 安装或升级交互层：

```bash
python3 <HTMLPPT_INTERACTION_EDITOR_ROOT>/scripts/install_editor.py <DECK_DIR>
```

先运行 `--dry-run`。检测结果为 `unsafe` 时停止，向用户说明备用翻页规则；只有用户明确同意后才使用 `--use-fallback` 生成“原名称-可编辑版”。检测结果为 `unsafe-existing-editor` 时禁止叠加安装或用备用模式绕过，先按独立 Skill 的要求人工划定旧编辑器边界。

本仓库的 `assets/editor-core.*`、模板内 `HTMLPPT_EDITOR_CORE_*` 和同步脚本仅用于旧项目兼容。新建或新修改的 deck 不得把它们当作交互单一事实来源。独立安装器会从产物中安全移除这些带标记的旧核心，再安装新核心。

## 7. 独立 Skill 依赖（P0）

调用前依次查找：

1. 当前智能体已加载的 `$htmlppt-interaction-editor`。
2. `~/.agents/skills/htmlppt-interaction-editor/SKILL.md`
3. `~/.codex/skills/htmlppt-interaction-editor/SKILL.md`
4. `~/.claude/skills/htmlppt-interaction-editor/SKILL.md`

如果没有安装，智能体可以自行从公开仓库安装：

```bash
git clone https://github.com/chuanfan-ai/htmlppt-interaction-editor.git \
  ~/.agents/skills/htmlppt-interaction-editor
```

然后按当前平台的 Skill 目录规则建立链接或复制注册。安装后完整读取新 Skill 的 `SKILL.md` 和它要求的交互契约，再继续生成流程。

如果网络、权限或平台规则不允许自动安装，立即告诉用户缺少该依赖和准备采用的安装方式。禁止临时重写一套功能更少的编辑器来冒充完成。

`htmlppt-interaction-editor` 是以下能力的唯一规则源：

- 全屏、键盘/触屏和备用翻页。
- 左上角隐藏编辑入口和顶部工具栏。
- 文字、图片、视频新增、替换、删除、拖动、缩放、字号、颜色、单行。
- 撤销重做、当前页历史、整套备份、保存、恢复上次保存、重置和恢复原稿。
- `htmlppt-user-state.json`、`images/user-edits/`、一键启动文件及刷新恢复。

## 8. 本地预览和持久化

交互 Skill 安装后，优先使用它生成的一键入口：

- macOS：`打开可编辑PPT.command`
- Windows：`打开可编辑PPT.bat`
- Linux/macOS 终端：`打开可编辑PPT.sh`

纯 `file://` 可以演示和编辑；无法写回磁盘时由独立交互 Skill 自动下载状态备份。

## 9. 验收

交付前必须执行：

```bash
node scripts/validate-deck.mjs <DECK_DIR>/index.html --manifest <DECK_DIR>/source-manifest.json
node tests/image-provider-policy.test.mjs
python3 <HTMLPPT_INTERACTION_EDITOR_ROOT>/scripts/self_check.py
python3 <HTMLPPT_INTERACTION_EDITOR_ROOT>/scripts/install_editor.py <DECK_DIR> --dry-run
```

先在交互 Skill 安装前运行本 Skill 的内容结构校验，再安装交互层并按新 Skill 的 `references/qa-checklist.md` 做浏览器验收。如果项目没有来源清单，可以省略 `--manifest`。

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
  editor-core.css                旧项目兼容资源
  editor-core.js                 旧项目兼容资源
scripts/
  sync-editor-core.py            旧项目兼容同步脚本
  local-edit-server.py           旧项目兼容服务
  validate-deck.mjs              结构、顺序、逐字块和链接校验
tests/
  editor-contract.test.mjs       旧项目兼容回归
  image-provider-policy.test.mjs 配图供应商与安全边界回归
references/
  local-editor-contract.md       编辑、历史、恢复和迁移 P0 契约
  feishu-content-contract.md     飞书顺序、内容和逐字保护
  chuanfan-brand.md              个人网站品牌变量与使用规则
  style-c-conference-training.md 风格 C 完整规范
  checklist.md                   交付质量门禁
```
