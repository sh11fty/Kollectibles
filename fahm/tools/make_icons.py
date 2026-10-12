"""Draw the Fahm launcher icon: the word فهم set in Amiri Quran, as Android vector drawables.

    pip install fonttools brotli
    python3 tools/make_icons.py

Writes the adaptive-icon foreground (gold), the monochrome layer (for themed icons) and the status-bar
notification icon into android/app/src/main/res/drawable, plus a 512px preview SVG at ../docs/icon.svg.
The font is the one the app ships (web/fonts/amiri-quran.woff2, SIL Open Font License).
"""
import os

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = os.path.join(ROOT, "web", "fonts", "amiri-quran.woff2")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res", "drawable")
DOCS = os.path.join(ROOT, "docs")

GOLD = "#E9C46A"
GREEN = "#0F3D2E"


def num(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def joined_forms(font, text):
    """Glyph names for an Arabic word's initial / medial / final forms, read from the font's own GSUB tables."""
    gsub = font["GSUB"].table
    feats = {}
    for fr in gsub.FeatureList.FeatureRecord:
        feats.setdefault(fr.FeatureTag, set()).update(fr.Feature.LookupListIndex)

    def single(tag, glyph):
        for li in sorted(feats[tag]):
            for st in gsub.LookupList.Lookup[li].SubTable:
                st = getattr(st, "ExtSubTable", st)
                m = getattr(st, "mapping", None) or getattr(st, "alternates", None)
                if m and glyph in m:
                    hit = m[glyph]
                    return hit[0] if isinstance(hit, (list, tuple)) else hit
        return glyph

    cmap = font.getBestCmap()
    base = [cmap[ord(c)] for c in text]
    out = []
    for i, g in enumerate(base):
        if len(base) == 1:
            out.append(g)
        elif i == 0:
            out.append(single("init", g))
        elif i == len(base) - 1:
            out.append(single("fina", g))
        else:
            out.append(single("medi", g))
    return out


def word_path(font, text, width, cx, cy, flip=True):
    """SVG path data for `text` scaled to `width`, centred on (cx, cy)."""
    names = joined_forms(font, text)
    gs = font.getGlyphSet()
    advances = [font["hmtx"][n][0] for n in names]
    total = sum(advances)
    # right-to-left: the first letter sits at the right-hand end
    xs = []
    x = total
    for a in advances:
        x -= a
        xs.append(x)

    def draw(pen, scale, dx, dy):
        for n, x0 in zip(names, xs):
            tp = TransformPen(pen, (scale, 0, 0, -scale if flip else scale, dx + x0 * scale, dy))
            gs[n].draw(tp)

    bp = BoundsPen(gs)
    for n, x0 in zip(names, xs):
        gs[n].draw(TransformPen(bp, (1, 0, 0, 1, x0, 0)))
    x0, y0, x1, y1 = bp.bounds
    scale = width / (x1 - x0)
    # place so that the bounding box centre lands on (cx, cy)
    dx = cx - ((x0 + x1) / 2) * scale
    dy = cy + ((y0 + y1) / 2) * scale if flip else cy - ((y0 + y1) / 2) * scale
    pen = SVGPathPen(gs, ntos=num)
    draw(pen, scale, dx, dy)
    return pen.getCommands()


def vector(size_dp, viewport, path_data, color):
    return (
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        f'    android:width="{size_dp}dp" android:height="{size_dp}dp"\n'
        f'    android:viewportWidth="{viewport}" android:viewportHeight="{viewport}">\n'
        f'    <path android:fillColor="{color}"\n        android:pathData="{path_data}" />\n'
        "</vector>\n"
    )


def main():
    font = TTFont(FONT)
    word = word_path(font, "فهم", width=50, cx=54, cy=52)
    with open(os.path.join(RES, "ic_launcher_foreground.xml"), "w") as f:
        f.write(vector(108, 108, word, GOLD))
    with open(os.path.join(RES, "ic_launcher_monochrome.xml"), "w") as f:
        f.write(vector(108, 108, word, "#FF000000"))

    # Status-bar icon: an open book (the word itself is too fine at 24dp)
    book = (
        "M3,5.6C5.6,4.6 9,4.7 11.2,6.3L11.2,19.2C9,17.8 5.6,17.7 3,18.7Z"
        "M21,5.6C18.4,4.6 15,4.7 12.8,6.3L12.8,19.2C15,17.8 18.4,17.7 21,18.7Z"
    )
    with open(os.path.join(RES, "ic_stat_fahm.xml"), "w") as f:
        f.write(vector(24, 24, book, "#FFFFFFFF"))

    os.makedirs(DOCS, exist_ok=True)
    svg_word = word_path(font, "فهم", width=300, cx=256, cy=256)
    with open(os.path.join(DOCS, "icon.svg"), "w") as f:
        f.write(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'<rect width="512" height="512" rx="112" fill="{GREEN}"/>'
            f'<path d="{svg_word}" fill="{GOLD}"/></svg>\n'
        )
    print("icons written")


if __name__ == "__main__":
    main()
