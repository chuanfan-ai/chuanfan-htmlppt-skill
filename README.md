# Chuanfan HTMLPPT Skill

一个面向本地 AI Agent 的 HTMLPPT 生成 skill。它可以生成横向翻页网页 PPT，并内置演示级本地编辑能力：改字、替换图片、添加文字、添加图片、拖动缩放、删除选中元素、保存版本和恢复历史版本。

本仓库是船帆维护的 HTMLPPT skill，基于 [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) 做个人增强。原始视觉系统、版式体系和大量质量规则来自歸藏维护的开源项目；本版本重点增强了本地演示编辑、图片落盘保存和 Codex/Claude 共享 skill 使用体验。

## 核心能力

- 生成单文件 HTMLPPT / 横向翻页网页 PPT
- 支持两套视觉系统：
  - 电子杂志 × 电子墨水
  - 瑞士国际主义
- 支持键盘、滚轮、触屏翻页
- 支持 Motion One 入场动效，本地文件和 CDN 双保险
- 支持低功耗静态模式
- 支持图片点击原图放大
- 支持视频原比例播放，避免 9:16 视频被拉伸成 16:9
- 支持本地演示编辑层：
  - 直接编辑页面文字
  - 保留提示词、代码块、列表、卡片等高价值文本，并让它们可编辑
  - 替换已有图片
  - 添加新文字
  - 添加新图片
  - 拖动位置
  - 拖右下角缩放
  - 删除选中元素
  - 保存当前编辑为版本
  - 从历史版本一键恢复
- 支持本地编辑服务：
  - 图片保存到 `images/user-edits/`
  - HTML 只保存相对路径
  - 按图片 hash 去重，避免重复复制
  - 不把大图 base64 塞进 `localStorage`
- 内置迭代安全规则：
  - 修改已有 HTMLPPT 前先复制完整目录，避免新旧版本覆盖
  - 不能把模板里的完整编辑器简化成只显示按钮的伪编辑器
  - 验收时必须实际检查文字编辑、图片替换、保存版本和历史恢复

## 适合场景

- 用文章、PDF、飞书文档、Markdown 做演示 PPT
- 线下分享、私享会、demo day、产品发布
- 需要漂亮但可本地快速修改的 HTMLPPT
- 需要把飞书/本地文档中的图片、视频原比例放入演示文稿
- 演示前临时补字、补图、调整位置

不适合：

- 完整 PowerPoint 编辑器替代品
- 多人实时协作编辑
- 超复杂表格和数据看板
- 需要导出原生 `.pptx` 的工作流

## 安装

### Claude Code

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/chuanfan-ai/chuanfan-htmlppt-skill.git ~/.claude/skills/chuanfan-htmlppt-skill
```

### Codex

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/chuanfan-ai/chuanfan-htmlppt-skill.git ~/.codex/skills/chuanfan-htmlppt-skill
```

### 共享 skill 池

如果你像我一样让多个智能体共用一份 skill，可以放到共享目录，然后软链到各平台：

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/chuanfan-ai/chuanfan-htmlppt-skill.git ~/.agents/skills/chuanfan-htmlppt-skill

ln -sfn ~/.agents/skills/chuanfan-htmlppt-skill ~/.claude/skills/chuanfan-htmlppt-skill
ln -sfn ~/.agents/skills/chuanfan-htmlppt-skill ~/.codex/skills/chuanfan-htmlppt-skill
```

## 使用方式

安装后，对支持 skill 的 Agent 说：

```text
帮我把这份文档做成一份瑞士风 HTMLPPT。
```

或者：

```text
根据这篇文章做一份电子杂志风演讲 PPT，控制在 10 页以内。
```

常见触发词：

- 做 PPT
- 生成 HTMLPPT
- 生成 HTML PPT
- 杂志风 PPT
- 瑞士风 PPT
- horizontal swipe deck
- 用 chuanfan-htmlppt-skill

## 本地编辑服务

普通演示时，直接打开生成的 `index.html` 即可。

如果需要在浏览器里持久化替换图片或新增图片，启动本地编辑服务：

```bash
python3 ~/.agents/skills/chuanfan-htmlppt-skill/scripts/local-edit-server.py --deck-dir /path/to/your/ppt --open
```

如果安装在 Claude 或 Codex 私有目录，把脚本路径换成实际位置：

```bash
python3 ~/.codex/skills/chuanfan-htmlppt-skill/scripts/local-edit-server.py --deck-dir /path/to/your/ppt --open
```

服务启动后会打开：

```text
http://127.0.0.1:17777/index.html
```

编辑规则：

- 文字修改保存到浏览器 `localStorage`
- 保存版本和历史版本保存到浏览器 `localStorage`，绑定当前页面路径
- 替换图片和新增图片保存到 `images/user-edits/`
- HTML 里只记录图片相对路径
- 同一张图片重复使用会按 hash 去重
- 交付或拷贝 PPT 时，需要带上整个 PPT 文件夹

## 目录结构

```text
chuanfan-htmlppt-skill/
├── SKILL.md
├── assets/
│   ├── template.html
│   ├── template-swiss.html
│   └── motion.min.js
├── references/
│   ├── layouts.md
│   ├── layouts-swiss.md
│   ├── themes.md
│   ├── themes-swiss.md
│   ├── image-prompts.md
│   ├── screenshot-framing.md
│   └── checklist.md
└── scripts/
    ├── local-edit-server.py
    └── validate-swiss-deck.mjs
```

## 校验

校验 skill 基本结构：

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py /path/to/chuanfan-htmlppt-skill
```

校验瑞士风 deck：

```bash
node scripts/validate-swiss-deck.mjs /path/to/index.html
```

检查本地编辑服务：

```bash
python3 scripts/local-edit-server.py --help
```

## 和原版的主要差异

相对原版，本增强版主要增加：

- 本地编辑配置面板
- 图片替换落盘保存
- 图片 hash 去重
- 保存版本和历史版本恢复
- 提示词、代码块、列表、卡片等内容默认纳入可编辑范围
- 添加文字浮层
- 添加图片浮层
- 拖动和缩放浮层元素
- 删除选中浮层元素
- 图片点击放大
- 视频原比例播放规则
- 面向 Codex / Claude 共享 skill 池的说明

## 许可

本仓库保留原项目许可证，见 [LICENSE](./LICENSE)。

原项目来源：[op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill)。
