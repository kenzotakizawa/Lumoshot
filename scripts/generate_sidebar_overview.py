"""Generate a labeled overview of the left sidebar (all drawing + image-operation
tools with their shortcut keys), matching the style of header-overview.png but
for the section that previously had no illustration at all.

Run: python3 scripts/generate_sidebar_overview.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image, ImageDraw

from generate_guide_gifs import F12, F14, F18, OUT_DIRS, rr, shadow_card  # noqa: E402

W, H = 620, 960

# (icon shorthand, label, shortcut key or None). English-only labels, matching
# the convention already used by every other synthetic mockup in this pipeline
# (captions are drawn in English; the surrounding React copy carries the
# Japanese translation instead of baking CJK text into the generated image).
DRAWING_TOOLS = [
    ("V", "Select", "V"),
    ("R", "Rectangle", "R"),
    ("R+", "Rounded Rectangle", None),
    ("A", "Arrow", "A"),
    ("B", "Speech Bubble", "B"),
    ("T", "Text", "T"),
    ("N", "Step Number", "N"),
    ("M", "Click Icon", "M"),
    ("P", "Pen", "P"),
    ("H", "Highlighter", "H"),
    ("S", "Spotlight (Rect)", "S"),
    ("S+", "Spotlight (Ellipse)", None),
    ("U", "Blur", "U"),
    ("Z", "Zoom (Rect)", None),
    ("Z+", "Zoom (Ellipse)", None),
]

IMAGE_OPS = [
    ("Im", "Insert Image", None),
    ("Rz", "Resize", None),
    ("C", "Crop", "C"),
    ("BA", "Before / After", None),
]


def draw_group(draw: ImageDraw.ImageDraw, img: Image.Image, x: int, y: int, w: int, title: str, rows: list[tuple[str, str, str | None]], row_h: int = 40) -> int:
    draw.text((x, y), title, fill="#111827", font=F14)
    y += 26
    for icon, label_text, shortcut in rows:
        rr(draw, (x, y, x + w, y + row_h - 8), 8, "#ffffff", "#e2e8f0", 1)
        rr(draw, (x + 8, y + 6, x + 40, y + row_h - 14), 7, "#eef2ff")
        draw.text((x + 14, y + 10), icon, fill="#4f46e5", font=F12)
        draw.text((x + 52, y + 9), label_text, fill="#1f2937", font=F14)
        if shortcut:
            badge_x2 = x + w - 8
            badge_x1 = badge_x2 - 26
            rr(draw, (badge_x1, y + 6, badge_x2, y + row_h - 14), 6, "#111827")
            draw.text((badge_x1 + 8, y + 9), shortcut, fill="#ffffff", font=F12)
        y += row_h
    return y + 10


def sidebar_overview() -> Image.Image:
    img = Image.new("RGBA", (W, H), "#f5f7fb")
    shadow_card(img, (16, 16, W - 16, H - 16), 20, "#ffffff")
    d = ImageDraw.Draw(img)

    x, y, w = 40, 44, W - 80
    d.text((x, y), "Lumoshot — Left Sidebar", fill="#111827", font=F18)
    y += 40

    y = draw_group(d, img, x, y, w, "Drawing Tools", DRAWING_TOOLS)
    y += 14
    y = draw_group(d, img, x, y, w, "Image Operations", IMAGE_OPS)

    return img


def main() -> None:
    img = sidebar_overview().convert("RGB")
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "sidebar-overview.png"
        img.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
