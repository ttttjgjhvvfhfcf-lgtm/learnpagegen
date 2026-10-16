#!/usr/bin/env python3
"""Bettet lokale <img src="…">-Bilder einer Lernseite als data:-URI ein → eine einzelne, weitergebbare HTML-Datei.

    python3 tools/embed-images.py pages/MET-Lernseite.html [--out datei.html] [--max-width 1600] [--quality 78]

Die Quelle bleibt unverändert (relative Pfade: klein, gut editierbar). Weitergegeben wird die eingebettete Kopie
(Standard: <name>.eingebettet.html). Fotos werden auf --max-width verkleinert und als JPEG gespeichert,
Bilder mit Transparenz bleiben PNG, SVG/GIF werden unverändert eingebettet. Benötigt Pillow (pip install pillow).
Exit-Code 1, wenn ein referenziertes Bild fehlt.
"""
import argparse
import base64
import io
import os
import re
import sys
from urllib.parse import unquote

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow fehlt: pip install pillow")

IMG_SRC = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', re.I)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page")
    ap.add_argument("--out")
    ap.add_argument("--max-width", type=int, default=1600)
    ap.add_argument("--quality", type=int, default=78)
    a = ap.parse_args()

    page = os.path.abspath(a.page)
    base = os.path.dirname(page)
    out = a.out or os.path.splitext(page)[0] + ".eingebettet.html"
    with open(page, encoding="utf-8") as f:
        html = f.read()

    cache, missing = {}, []
    stats = {"n": 0, "src": 0, "dst": 0}

    def encode(src):
        path = os.path.normpath(os.path.join(base, unquote(src.split("#")[0].split("?")[0])))
        if path in cache:
            return cache[path]
        if not os.path.isfile(path):
            missing.append(src)
            return None
        raw = open(path, "rb").read()
        ext = os.path.splitext(path)[1].lower()
        if ext in (".svg", ".gif"):
            mime, data = ("image/svg+xml" if ext == ".svg" else "image/gif"), raw
        else:
            im = ImageOps.exif_transpose(Image.open(path))
            if im.width > a.max_width:
                im = im.resize((a.max_width, round(im.height * a.max_width / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                im.convert("RGBA").save(buf, "PNG", optimize=True)
                mime = "image/png"
            else:
                im.convert("RGB").save(buf, "JPEG", quality=a.quality, optimize=True, progressive=True)
                mime = "image/jpeg"
            data = buf.getvalue()
        stats["n"] += 1
        stats["src"] += len(raw)
        stats["dst"] += len(data)
        uri = "data:%s;base64,%s" % (mime, base64.b64encode(data).decode("ascii"))
        cache[path] = uri
        return uri

    def repl(m):
        src = m.group(2)
        if src.startswith(("data:", "http:", "https:", "//", "#")):
            return m.group(0)
        uri = encode(src)
        return m.group(0) if uri is None else m.group(1) + uri + m.group(3)

    # HTML-Kommentare nicht anfassen (dort stehen z. B. Beispiel-<img>-Tags der Vorlage)
    parts = re.split(r"(<!--.*?-->)", html, flags=re.S)
    new = "".join(p if i % 2 else IMG_SRC.sub(repl, p) for i, p in enumerate(parts))
    with open(out, "w", encoding="utf-8") as f:
        f.write(new)

    mb = lambda n: "%.1f MB" % (n / 1048576)
    print("%d Bild(er) eingebettet (%s → %s) → %s (%s)" % (stats["n"], mb(stats["src"]), mb(stats["dst"]), out, mb(len(new.encode("utf-8")))))
    if missing:
        print("FEHLT: " + ", ".join(sorted(set(missing))), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
