#!/usr/bin/env python3
"""Inline the canonical editor core into every HTMLPPT template.

The distributable templates remain single-file HTML.  CSS and JavaScript live
in assets/editor-core.* as the only editable source; this script keeps the
inlined copies byte-identical and adds the navigation guards required by the
editor contract.
"""

from __future__ import annotations

import argparse
import hashlib
import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DEFAULT_TEMPLATES = [
    ASSETS / "template.html",
    ASSETS / "template-swiss.html",
    ASSETS / "template-conference.html",
]


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def indent(text: str, prefix: str) -> str:
    return "\n".join(prefix + line if line else "" for line in text.rstrip().splitlines())


def css_block(css: str) -> str:
    return (
        f"  /* HTMLPPT_EDITOR_CORE_CSS_START sha256={digest(css)} */\n"
        f"{indent(css, '  ')}\n"
        "  /* HTMLPPT_EDITOR_CORE_CSS_END */"
    )


def js_block(js: str) -> str:
    return (
        "<script>\n"
        f"/* HTMLPPT_EDITOR_CORE_JS_START sha256={digest(js)} */\n"
        f"{js.rstrip()}\n"
        "/* HTMLPPT_EDITOR_CORE_JS_END */\n"
        "</script>"
    )


def replace_editor_css(html: str, block: str) -> str:
    marker = re.compile(
        r"  /\* HTMLPPT_EDITOR_CORE_CSS_START[^\n]*\*/[\s\S]*?"
        r"  /\* HTMLPPT_EDITOR_CORE_CSS_END \*/"
    )
    if marker.search(html):
        return marker.sub(lambda _match: block, html, count=1)

    legacy = re.compile(
        r"\n  /\* Local presentation editor:[\s\S]*?"
        r"\n  \.g-history-empty\{[^\n]*\}"
    )
    if not legacy.search(html):
        raise ValueError("editor CSS insertion point not found")
    return legacy.sub(lambda _match: "\n" + block, html, count=1)


def replace_editor_js(html: str, block: str) -> str:
    marker = re.compile(
        r"[ \t]*<script>[ \t]*\n/\* HTMLPPT_EDITOR_CORE_JS_START[^\n]*\*/[\s\S]*?"
        r"/\* HTMLPPT_EDITOR_CORE_JS_END \*/[ \t]*\n[ \t]*</script>"
    )
    if marker.search(html):
        return marker.sub(lambda _match: block, html, count=1)

    legacy = re.compile(
        r"<script>\n/\* =============== Local editor enhancements ===============[\s\S]*?"
        r"\n</script>(?=\n</body>)"
    )
    if not legacy.search(html):
        raise ValueError("editor JS insertion point not found")
    return legacy.sub(lambda _match: block, html, count=1)


def add_navigation_guards(html: str) -> str:
    html = re.sub(
        r"addEventListener\('keydown',e=>\{\n(?!  if\(window\.__htmlPptEditorShouldYield)",
        "addEventListener('keydown',e=>{\n  if(window.__htmlPptEditorShouldYield?.(e))return;\n",
        html,
        count=1,
    )
    html = re.sub(
        r"addEventListener\('wheel',e=>\{\n(?!  if\(window\.__htmlPptEditorActive)",
        "addEventListener('wheel',e=>{\n  if(window.__htmlPptEditorActive?.())return;\n",
        html,
        count=1,
    )
    html = re.sub(
        r"addEventListener\('touchend',e=>\{\n(?!  if\(window\.__htmlPptEditorActive)",
        "addEventListener('touchend',e=>{\n  if(window.__htmlPptEditorActive?.())return;\n",
        html,
        count=1,
    )
    return html


def synced_html(path: pathlib.Path, css: str, js: str) -> str:
    html = path.read_text(encoding="utf-8")
    html = replace_editor_css(html, css_block(css))
    html = replace_editor_js(html, js_block(js))
    html = add_navigation_guards(html)
    return html


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("templates", nargs="*", type=pathlib.Path)
    parser.add_argument("--check", action="store_true", help="fail if a template is not synchronized")
    args = parser.parse_args()

    css = (ASSETS / "editor-core.css").read_text(encoding="utf-8")
    js = (ASSETS / "editor-core.js").read_text(encoding="utf-8")
    templates = args.templates or DEFAULT_TEMPLATES
    failures: list[str] = []

    for raw in templates:
        path = raw if raw.is_absolute() else (ROOT / raw)
        if not path.exists():
            if raw in DEFAULT_TEMPLATES:
                continue
            failures.append(f"missing template: {path}")
            continue
        try:
            expected = synced_html(path, css, js)
        except ValueError as error:
            failures.append(f"{path.name}: {error}")
            continue
        current = path.read_text(encoding="utf-8")
        if args.check:
            if current != expected:
                failures.append(f"{path.name}: editor core is out of sync")
        elif current != expected:
            path.write_text(expected, encoding="utf-8")
            print(f"updated {path.relative_to(ROOT)}")
        else:
            print(f"ok {path.relative_to(ROOT)}")

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
