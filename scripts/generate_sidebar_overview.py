"""Generate the left-sidebar overview image for the guide from a REAL app
screenshot, rather than a synthetic mockup.

header-overview.png (a real screenshot of the whole editor window, captured
separately) already shows the entire left sidebar with all of its real icons.
This script crops just that sidebar column out of it, so the guide's sidebar
illustration uses the same authentic rendering (real icons/fonts/shadows) as
every other "real capture" asset, instead of a hand-drawn approximation.

Run: python3 scripts/generate_sidebar_overview.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIRS = [ROOT / "public-web" / "guide", ROOT / "public" / "guide"]
SOURCE = ROOT / "public-web" / "guide" / "header-overview.png"

# Pixel bounds of the sidebar column within header-overview.png, found by
# sampling rows/columns for the white-card -> canvas-background transition.
# Kept narrow enough to exclude both the ruler (canvas area) and the red
# highlight box drawn around the header in that screenshot.
CROP_BOX = (0, 0, 340, None)  # height filled in from the source image
TARGET_WIDTH = 300


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source screenshot: {SOURCE}")

    img = Image.open(SOURCE).convert("RGB")
    left, top, right, _ = CROP_BOX
    crop = img.crop((left, top, right, img.height))

    scale = TARGET_WIDTH / crop.width
    target_h = round(crop.height * scale)
    resized = crop.resize((TARGET_WIDTH, target_h), Image.Resampling.LANCZOS)

    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "sidebar-overview.png"
        resized.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    main()
