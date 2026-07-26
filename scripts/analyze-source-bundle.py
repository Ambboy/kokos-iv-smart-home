#!/usr/bin/env python3
"""Reproducibly fingerprint and structurally inspect the KOKOS IV source bundle."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_mtext(value: str) -> str:
    value = value.replace("\\P", " / ")
    value = re.sub(r"\\[A-Za-z][^;{}]*;", "", value)
    return value.replace("{", "").replace("}", "").strip()


def inspect_dwg(path: Path, dwgread: str) -> dict:
    with tempfile.TemporaryDirectory(prefix="kokos-dwg-") as tmp:
        output = Path(tmp) / "drawing.min.json"
        result = subprocess.run(
            [dwgread, "-O", "minJSON", "-o", str(output), str(path)],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0 or not output.exists():
            raise RuntimeError(f"dwgread failed for {path.name}: {result.stderr.strip()}")
        data = json.loads(output.read_text(encoding="utf-8"))

    objects = data.get("OBJECTS", [])
    kinds = collections.Counter(
        item.get("object") if item.get("object") is not None else item.get("type")
        for item in objects
    )
    titles = []
    for item in objects:
        if item.get("entity") != "MTEXT" or not item.get("text"):
            continue
        text = clean_mtext(item["text"])
        if "ПЛАН" in text.upper() or "СХЕМА" in text.upper():
            titles.append(text)

    header = data.get("FILEHEADER", {})
    drawing_header = data.get("HEADER", {})
    return {
        "logicalName": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "dwgVersion": header.get("version"),
        "codepage": header.get("codepage"),
        "objects": len(objects),
        "layers": kinds.get("LAYER", 0),
        "layouts": kinds.get("LAYOUT", 0),
        "extents": {
            "min": drawing_header.get("EXTMIN"),
            "max": drawing_header.get("EXTMAX"),
        },
        "detectedTitles": titles[:8],
        "parserStderr": result.stderr.strip(),
    }


def inspect_pdf(path: Path) -> dict:
    result = {
        "logicalName": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    try:
        import fitz  # type: ignore
    except ImportError:
        result["pages"] = None
        result["note"] = "Install PyMuPDF to collect PDF page count."
        return result

    with fitz.open(path) as document:
        result["pages"] = document.page_count
        result["textCharacters"] = sum(len(page.get_text("text") or "") for page in document)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    source_dir = args.source_dir.expanduser().resolve()
    dwgread = shutil.which("dwgread")
    if not dwgread:
        raise SystemExit("dwgread is required (Homebrew package: libredwg)")

    report = {
        "sourceDirectory": str(source_dir),
        "pdf": [inspect_pdf(path) for path in sorted(source_dir.glob("*.pdf"))],
        "dwg": [inspect_dwg(path, dwgread) for path in sorted(source_dir.glob("*.dwg"))],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
