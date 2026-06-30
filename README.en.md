# Chuanfan HTMLPPT Skill

An enhanced local-agent skill for generating HTMLPPT: horizontal, browser-native HTML presentation decks. It builds on [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) and adds a practical local presentation editor.

## What It Does

- Generates single-file HTMLPPT decks
- Supports two visual systems:
  - Editorial magazine x electronic ink
  - Swiss International Style
- Supports keyboard, wheel, and touch navigation
- Preserves image and video aspect ratios
- Provides image lightbox preview
- Adds a local presentation editing layer:
  - edit text
  - replace existing images
  - add text overlays
  - add image overlays
  - drag and resize overlay items
  - delete selected overlay items
- Includes a local editor service:
  - saves image edits to `images/user-edits/`
  - stores only relative paths in the HTML/browser state
  - deduplicates images by content hash
  - avoids storing large base64 images in `localStorage`

## Install

Claude Code:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/chuanfan-ai/chuanfan-htmlppt-skill.git ~/.claude/skills/chuanfan-htmlppt-skill
```

Codex:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/chuanfan-ai/chuanfan-htmlppt-skill.git ~/.codex/skills/chuanfan-htmlppt-skill
```

Shared skill pool:

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/chuanfan-ai/chuanfan-htmlppt-skill.git ~/.agents/skills/chuanfan-htmlppt-skill

ln -sfn ~/.agents/skills/chuanfan-htmlppt-skill ~/.claude/skills/chuanfan-htmlppt-skill
ln -sfn ~/.agents/skills/chuanfan-htmlppt-skill ~/.codex/skills/chuanfan-htmlppt-skill
```

## Use

Ask your local agent:

```text
Create a Swiss-style HTML presentation from this document.
```

or:

```text
Turn this article into an editorial magazine-style HTML deck.
```

## Local Editor Service

Opening the generated `index.html` directly is enough for normal presentation.

For persistent image replacement or added images, start the local editor service:

```bash
python3 ~/.agents/skills/chuanfan-htmlppt-skill/scripts/local-edit-server.py --deck-dir /path/to/your/ppt --open
```

It opens:

```text
http://127.0.0.1:17777/index.html
```

Editing behavior:

- text edits are saved in browser `localStorage`
- image replacements and added images are saved to `images/user-edits/`
- repeated identical images are deduplicated by hash
- the deck only stores relative paths
- when sharing the deck, share the whole deck folder

## Validation

Validate the skill:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py /path/to/chuanfan-htmlppt-skill
```

Validate a Swiss deck:

```bash
node scripts/validate-swiss-deck.mjs /path/to/index.html
```

Check the editor service:

```bash
python3 scripts/local-edit-server.py --help
```

## License and Attribution

This repository keeps the original license. See [LICENSE](./LICENSE).

Original project: [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill).
