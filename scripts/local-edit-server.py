#!/usr/bin/env python3
"""Local editor service for guizang HTML decks.

It serves one deck directory and accepts image replacements, saving them under
images/user-edits/ with content-hash deduplication.
"""

from __future__ import annotations

import argparse
import cgi
import hashlib
import json
import mimetypes
import os
import pathlib
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


VERSION = "1.0.0"
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
ALLOWED_EXTS = {
    ".png": "png",
    ".jpg": "jpg",
    ".jpeg": "jpg",
    ".webp": "webp",
    ".gif": "gif",
    ".avif": "avif",
}


def json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def safe_ext(filename: str, content_type: str) -> str:
    ext = pathlib.Path(filename or "").suffix.lower()
    if ext in ALLOWED_EXTS:
        return "." + ALLOWED_EXTS[ext]
    guessed = mimetypes.guess_extension(content_type or "")
    if guessed and guessed.lower() in ALLOWED_EXTS:
        return "." + ALLOWED_EXTS[guessed.lower()]
    return ".png"


class EditorHandler(SimpleHTTPRequestHandler):
    deck_dir: pathlib.Path

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/__guizang_editor__/config":
            self.send_json(
                {
                    "ok": True,
                    "version": VERSION,
                    "deckDir": str(self.deck_dir),
                    "saveDir": "images/user-edits",
                    "maxUploadBytes": MAX_UPLOAD_BYTES,
                }
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/__guizang_editor__/upload-image":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            self.send_json({"ok": False, "error": "empty upload"}, status=400)
            return
        if length > MAX_UPLOAD_BYTES:
            self.send_json({"ok": False, "error": "file too large"}, status=413)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": str(length),
            },
        )
        item = form["file"] if "file" in form else None
        if item is None or not getattr(item, "file", None):
            self.send_json({"ok": False, "error": "missing file"}, status=400)
            return

        data = item.file.read()
        digest = hashlib.sha256(data).hexdigest()
        ext = safe_ext(getattr(item, "filename", ""), getattr(item, "type", ""))
        save_dir = self.deck_dir / "images" / "user-edits"
        save_dir.mkdir(parents=True, exist_ok=True)
        target = save_dir / f"{digest[:16]}{ext}"
        duplicate = target.exists()
        if not duplicate:
            target.write_bytes(data)

        rel = target.relative_to(self.deck_dir).as_posix()
        self.send_json(
            {
                "ok": True,
                "path": rel,
                "hash": digest,
                "bytes": len(data),
                "duplicate": duplicate,
            }
        )

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve and edit a guizang HTML PPT deck locally.")
    parser.add_argument("--deck-dir", default=".", help="Deck directory containing index.html and images/")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=17777)
    parser.add_argument("--open", action="store_true", help="Open the deck URL in the default browser")
    args = parser.parse_args()

    deck_dir = pathlib.Path(args.deck_dir).expanduser().resolve()
    if not deck_dir.is_dir():
        print(f"deck dir does not exist: {deck_dir}", file=sys.stderr)
        return 2

    class Handler(EditorHandler):
        def __init__(self, *handler_args, **handler_kwargs):
            super().__init__(*handler_args, directory=str(deck_dir), **handler_kwargs)

    Handler.deck_dir = deck_dir

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}/index.html"
    print(f"guizang local editor: {url}")
    print(f"image edits: {deck_dir / 'images' / 'user-edits'}")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
