from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_ROOT = ROOT / ".guide-capture-real"
OUT_DIRS = [ROOT / "public-web" / "guide", ROOT / "public" / "guide"]
TARGET_SIZE = (800, 450)


def frame_order(path: Path) -> tuple[int, str]:
    try:
        return (int(float(path.stem)), path.name)
    except ValueError:
        return (999, path.name)


def compile_feature(feature_dir: Path) -> None:
    frames = []
    for src in sorted(feature_dir.glob("*.png"), key=frame_order):
        img = Image.open(src).convert("RGB").resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        frames.append(img.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))

    if len(frames) < 2:
        return

    filename = f"{feature_dir.name}.gif"
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        frames[0].save(
            out_dir / filename,
            save_all=True,
            append_images=frames[1:],
            duration=650,
            loop=0,
            optimize=True,
            disposal=2,
        )
    print(filename)


def main() -> None:
    if not CAPTURE_ROOT.exists():
        raise SystemExit(f"Missing capture directory: {CAPTURE_ROOT}")

    for feature_dir in sorted(p for p in CAPTURE_ROOT.iterdir() if p.is_dir()):
        compile_feature(feature_dir)


if __name__ == "__main__":
    main()
