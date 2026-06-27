from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIRS = [ROOT / "public-web" / "guide", ROOT / "public" / "guide"]
WEB_HOME_SCREENSHOT = ROOT / ".guide-web-home.png"
WEB_EDITOR_SCREENSHOT = ROOT / ".guide-web-editor.png"
W, H = 800, 450


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


F10 = font(10)
F12 = font(12)
F14 = font(14)
F16 = font(16)
F18 = font(18, True)
F22 = font(22, True)
F28 = font(28, True)


def ease(t: float) -> float:
    return 0.5 - math.cos(math.pi * t) / 2


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * ease(t)


def rr(draw: ImageDraw.ImageDraw, box, radius=10, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadow_card(img: Image.Image, box, radius=14, fill="#ffffff", shadow="#d8dee9"):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x1, y1, x2, y2 = box
    d.rounded_rectangle((x1, y1 + 8, x2, y2 + 8), radius=radius, fill=shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill)


def arrow_head(draw: ImageDraw.ImageDraw, start, end, color="#ef4444", size=14):
    x1, y1 = start
    x2, y2 = end
    ang = math.atan2(y2 - y1, x2 - x1)
    pts = []
    for off in (math.pi * 0.82, -math.pi * 0.82):
        pts.append((x2 + math.cos(ang + off) * size, y2 + math.sin(ang + off) * size))
    draw.polygon([(x2, y2), pts[0], pts[1]], fill=color)


def cursor(draw: ImageDraw.ImageDraw, x: int, y: int, color="#111827"):
    pts = [(x, y), (x, y + 42), (x + 11, y + 32), (x + 19, y + 50), (x + 28, y + 46), (x + 20, y + 28), (x + 35, y + 28)]
    draw.polygon(pts, fill="#ffffff", outline=color)


def small_icon(draw: ImageDraw.ImageDraw, x: int, y: int, size: int = 28):
    rr(draw, (x, y, x + size, y + size), 8, "#4f46e5")
    draw.rectangle((x + 7, y + 8, x + size - 7, y + size - 8), fill="#ffffff")
    draw.rectangle((x + 10, y + 11, x + size - 10, y + size - 11), outline="#facc15", width=2)


def browser_page_base():
    img = Image.new("RGBA", (W, H), "#eef2f8")
    d = ImageDraw.Draw(img)
    rr(d, (64, 46, 736, 404), 14, "#ffffff", "#cbd5e1")
    d.rectangle((64, 46, 736, 92), fill="#f8fafc")
    for i, color in enumerate(["#ef4444", "#f59e0b", "#22c55e"]):
        d.ellipse((84 + i * 18, 62, 96 + i * 18, 74), fill=color)
    rr(d, (156, 60, 536, 78), 9, "#ffffff", "#e2e8f0")
    d.text((172, 63), "example.com/project-dashboard", fill="#64748b", font=F10)
    small_icon(d, 646, 56, 28)
    dashboard(d, (108, 120, 692, 360))
    return img


def popup_box(draw: ImageDraw.ImageDraw, x: int, y: int, highlight: str | None = None):
    box = (x, y, x + 320, y + 366)
    rr(draw, box, 18, "#f8fafc", "#cbd5e1")
    small_icon(draw, x + 16, y + 16, 32)
    draw.text((x + 60, y + 22), "Lumoshot", fill="#111827", font=F18)
    draw.line((x + 16, y + 62, x + 304, y + 62), fill="#dbe3ef", width=1)

    def section(sy: int, icon: str, title: str):
        draw.text((x + 22, y + sy), icon, fill="#4f46e5", font=F12)
        draw.text((x + 42, y + sy - 1), title.upper(), fill="#475569", font=F12)

    def button(key: str, by: int, title: str, desc: str, icon: str):
        is_hot = key == highlight
        fill = "#ffffff"
        outline = "#4f46e5" if is_hot else "#dbe3ef"
        width = 3 if is_hot else 1
        rr(draw, (x + 18, y + by, x + 302, y + by + 54), 10, fill, outline, width)
        draw.text((x + 32, y + by + 16), icon, fill="#4f46e5", font=F14)
        draw.text((x + 62, y + by + 10), title, fill="#111827", font=F14)
        draw.text((x + 62, y + by + 30), desc, fill="#64748b", font=F10)

    section(78, "▣", "Window Capture")
    button("visible", 98, "Visible Area", "Capture what you see right now", "▣")
    button("selected", 160, "Selected Area", "Drag to select a specific region", "⌖")
    section(228, "▥", "System Capture")
    button("desktop", 248, "Entire Screen", "Capture with the system dialog", "▥")
    section(306, "▧", "Local Image")
    # Keep the final row compact so all five entry points fit in the guide frame.
    row_y = y + 326
    for key, title, xoff in [("upload", "Upload File", 18), ("clipboard", "Paste Clipboard", 162)]:
        is_hot = key == highlight
        rr(draw, (x + xoff, row_y, x + xoff + 140, row_y + 38), 10, "#ffffff", "#4f46e5" if is_hot else "#dbe3ef", 3 if is_hot else 1)
        draw.text((x + xoff + 12, row_y + 12), "▧", fill="#4f46e5", font=F12)
        draw.text((x + xoff + 36, row_y + 11), title, fill="#111827", font=F10)


def gif_popup_overview():
    frames = []
    steps = [
        (None, "Click the Lumoshot extension icon to open the popup.", (660, 70)),
        ("visible", "Window Capture: capture the visible area of the current tab.", (394, 142)),
        ("selected", "Window Capture: select a region on the current tab.", (394, 204)),
        ("desktop", "System Capture: choose a screen or window in the browser dialog.", (394, 292)),
        ("upload", "Local Image: upload an image from your computer.", (392, 374)),
        ("clipboard", "Local Image: paste an image from the clipboard.", (538, 374)),
    ]
    for highlight, text, cur in steps:
        img = browser_page_base()
        d = ImageDraw.Draw(img)
        if highlight is None:
            rr(d, (640, 50, 684, 88), 10, None, "#4f46e5", 3)
        popup_box(d, 240, 30, highlight)
        cursor(d, cur[0], cur[1])
        frames.append(label(img, text))
    return frames


def gif_capture_visible():
    frames = []
    steps = [
        ("browser", "Open the tab you want to capture.", None, (660, 70)),
        ("popup", "Click Lumoshot and choose Visible Area.", "visible", (394, 142)),
        ("flash", "Lumoshot captures only the visible part of the current tab.", None, (400, 250)),
        ("editor", "The screenshot opens directly in the editor.", None, (502, 238)),
        ("editor-markup", "Add annotations, then copy or save the PNG.", None, (502, 238)),
    ]
    for state, text, highlight, cur in steps:
        if state in ("editor", "editor-markup"):
            img, _, _ = editor_base()
            d = ImageDraw.Draw(img)
            if state == "editor-markup":
                d.line(((258, 306), (474, 242)), fill="#ef4444", width=6)
                arrow_head(d, (258, 306), (474, 242))
                rr(d, (494, 224, 638, 312), 4, None, "#ef4444", 5)
            cursor(d, cur[0], cur[1])
        else:
            img = browser_page_base()
            d = ImageDraw.Draw(img)
            if state == "browser":
                rr(d, (640, 50, 684, 88), 10, None, "#4f46e5", 3)
                cursor(d, cur[0], cur[1])
            elif state == "popup":
                popup_box(d, 240, 30, highlight)
                cursor(d, cur[0], cur[1])
            elif state == "flash":
                overlay = Image.new("RGBA", img.size, (79, 70, 229, 34))
                img.alpha_composite(overlay)
                rr(d, (106, 118, 694, 362), 10, None, "#4f46e5", 5)
        frames.append(label(img, text))
    return frames


def dashboard(draw: ImageDraw.ImageDraw, box, compact=False):
    x1, y1, x2, y2 = box
    rr(draw, box, 8, "#ffffff", "#dbe3ef")
    draw.rectangle((x1, y1, x2, y1 + 38), fill="#f8fafc")
    draw.text((x1 + 22, y1 + 62), "Project dashboard", fill="#111827", font=F22)
    draw.text((x1 + 22, y1 + 95), "Annotate the exact change you want.", fill="#64748b", font=F14)
    colors = ["#4f46e5", "#059669", "#dc2626"]
    labels = ["Review queue", "Conversion", "Alerts"]
    card_w = (x2 - x1 - 70) // 3
    for i in range(3):
        cx = x1 + 22 + i * (card_w + 13)
        cy = y1 + 135
        rr(draw, (cx, cy, cx + card_w, cy + 84), 8, "#f8fafc", "#e2e8f0")
        draw.rectangle((cx, cy, cx + 6, cy + 84), fill=colors[i])
        draw.text((cx + 18, cy + 20), labels[i], fill="#0f172a", font=F14)
        draw.text((cx + 18, cy + 48), ["24 items", "7.8%", "3 issues"][i], fill="#64748b", font=F12)
    if not compact:
        rr(draw, (x1 + 22, y2 - 72, x2 - 22, y2 - 26), 8, "#eef2ff")
        draw.text((x1 + 40, y2 - 59), "Use Lumoshot to make feedback clear.", fill="#3730a3", font=F14)


def editor_base(theme="light", zoom="100%", framed=False):
    dark = theme == "dark"
    img = Image.new("RGBA", (W, H), "#0f172a" if dark else "#f5f7fb")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, H), fill="#0f172a" if dark else "#f5f7fb")
    sidebar = (18, 70, 72, 382)
    rr(d, sidebar, 16, "#1e293b" if dark else "#ffffff", "#334155" if dark else "#e2e8f0")
    tool_y = 88
    icons = ["V", "R", "A", "B", "T", "N", "M", "P", "H", "S", "U", "Z"]
    for i, label in enumerate(icons):
        y = tool_y + i * 23
        fill = "#eef2ff" if i == 0 and not dark else ("#334155" if dark else "#ffffff")
        rr(d, (32, y, 58, y + 20), 6, fill)
        d.text((40, y + 4), label, fill="#4f46e5" if i == 0 else ("#cbd5e1" if dark else "#64748b"), font=F10)
    rr(d, (94, 18, 774, 58), 12, "#1e293b" if dark else "#ffffff", "#334155" if dark else "#e2e8f0")
    d.text((118, 31), "Lumoshot", fill="#f8fafc" if dark else "#111827", font=F16)
    d.text((218, 32), zoom, fill="#94a3b8", font=F12)
    header_items = ["Frame", "Resize", "Theme", "Help", "Undo", "Redo", "Copy", "Save PNG"]
    x = 318
    for item in header_items:
        w = 42 if item not in ("Resize", "Save PNG") else 56
        rr(d, (x, 25, x + w, 51), 7, "#334155" if dark else "#f8fafc", "#475569" if dark else "#e2e8f0")
        d.text((x + 7, 33), item, fill="#e2e8f0" if dark else "#334155", font=F10)
        x += w + 7
    canvas_box = (116, 84, 748, 396)
    d.rectangle((94, 70, 774, 418), fill="#1e293b" if dark else "#edf2f7")
    if framed:
        rr(d, (148, 104, 716, 376), 18, "#e5e7eb")
        shot = (176, 132, 688, 348)
    else:
        shot = (156, 116, 708, 364)
    dashboard(d, shot)
    return img, shot, canvas_box


def landing_base(highlight=None):
    img = Image.new("RGBA", (W, H), "#eef2f8")
    d = ImageDraw.Draw(img)
    shadow_card(img, (245, 54, 555, 392), 18, "#ffffff")
    d.text((330, 92), "Lumoshot", fill="#1e293b", font=F28)
    d.text((291, 132), "Annotate screenshots cleanly.", fill="#64748b", font=F14)
    buttons = [
        ("Capture screen", "#4f46e5"),
        ("Upload image", "#ffffff"),
        ("Try sample", "#ffffff"),
        ("Import project", "#ffffff"),
    ]
    y = 174
    for i, (label, fill) in enumerate(buttons):
        outline = "#4f46e5" if highlight == i else "#e2e8f0"
        width = 3 if highlight == i else 1
        rr(d, (290, y, 510, y + 36), 10, fill, outline, width)
        d.text((350 if i else 342, y + 10), label, fill="#ffffff" if i == 0 else "#1e293b", font=F12)
        y += 48
    d.text((286, 370), "Local-first. Images never upload.", fill="#94a3b8", font=F12)
    return img


def label(img, text):
    d = ImageDraw.Draw(img)
    rr(d, (24, 398, 776, 432), 9, "#111827")
    d.text((40, 407), text, fill="#ffffff", font=F14)
    return img


def mk_landing(labels):
    frames = []
    for i, text in enumerate(labels):
        frames.append(label(landing_base(i if i < 4 else None), text))
    return frames


def load_web_screenshot(path: Path) -> Image.Image | None:
    if not path.exists():
        return None
    try:
        return Image.open(path).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
    except OSError:
        return None


def web_landing_base(highlight: str | None = None):
    captured = load_web_screenshot(WEB_HOME_SCREENSHOT)
    if captured:
        d = ImageDraw.Draw(captured)
        boxes = {
            "capture": (238, 108, 553, 139),
            "upload": (238, 145, 553, 176),
            "sample": (238, 184, 553, 214),
        }
        if highlight in boxes:
            rr(d, boxes[highlight], 8, None, "#4f46e5", 3)
        return captured

    img = Image.new("RGBA", (W, H), "#eef1f8")
    d = ImageDraw.Draw(img)
    shadow_card(img, (190, 42, 610, 404), 20, "#ffffff", (15, 23, 42, 30))
    d.text((323, 82), "Lumoshot", fill="#111827", font=F28)
    d.text((248, 126), "Annotate screenshots and export them cleanly.", fill="#555555", font=F14)

    buttons = [
        ("capture", "Capture screen", "#4f46e5", "#ffffff"),
        ("upload", "Upload image", "#ffffff", "#1a1a2e"),
        ("sample", "Try sample", "#ffffff", "#1a1a2e"),
    ]
    y = 174
    for key, title, fill, text_color in buttons:
        is_hot = key == highlight
        outline = "#3730a3" if is_hot and key == "capture" else ("#4f46e5" if is_hot else "#e2e5ee")
        width = 3 if is_hot else 1
        rr(d, (230, y, 570, y + 48), 12, fill, outline, width)
        icon = "▣" if key == "capture" else ("↥" if key == "upload" else "▷")
        d.text((326, y + 17), icon, fill=text_color if key == "capture" else "#111827", font=F14)
        d.text((350, y + 15), title, fill=text_color, font=F16)
        y += 62

    d.text((274, 372), "Paste an image (Ctrl/⌘+V) or drag & drop it here", fill="#777777", font=F12)
    return img


def browser_picker_overlay(img: Image.Image, selected: str | None = None):
    layer = Image.new("RGBA", img.size, (15, 23, 42, 86))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    shadow_card(img, (214, 68, 586, 382), 18, "#ffffff", (15, 23, 42, 55))
    d.text((248, 98), "Choose what to share", fill="#111827", font=F22)
    d.text((248, 132), "Select another tab, a window, or your screen.", fill="#64748b", font=F12)
    tabs = [("Tab", 248), ("Window", 324), ("Screen", 426)]
    for name, x in tabs:
        active = name == (selected or "Tab")
        rr(d, (x, 158, x + 70, 188), 15, "#eef2ff" if active else "#f8fafc", "#4f46e5" if active else "#e2e8f0")
        d.text((x + 22, 167), name, fill="#3730a3" if active else "#64748b", font=F12)
    cards = [
        ("This tab", (248, 214, 364, 294)),
        ("Docs window", (382, 214, 498, 294)),
    ]
    for title, box in cards:
        active = selected == title
        rr(d, box, 10, "#ffffff", "#4f46e5" if active else "#dbe3ef", 3 if active else 1)
        d.rectangle((box[0] + 12, box[1] + 14, box[2] - 12, box[1] + 38), fill="#eef2ff")
        d.rectangle((box[0] + 12, box[1] + 48, box[2] - 36, box[1] + 58), fill="#dbe3ef")
        d.text((box[0] + 12, box[3] - 24), title, fill="#111827", font=F10)
    rr(d, (410, 326, 520, 358), 9, "#4f46e5")
    d.text((446, 336), "Share", fill="#ffffff", font=F12)
    return img


def web_editor_frame(markup: bool = False):
    captured = load_web_screenshot(WEB_EDITOR_SCREENSHOT)
    if captured:
        if markup:
            d = ImageDraw.Draw(captured)
            d.line(((322, 192), (610, 204)), fill="#ef4444", width=5)
            arrow_head(d, (322, 192), (610, 204), size=12)
            rr(d, (500, 178, 632, 260), 4, None, "#ef4444", 4)
        return captured

    img, _, _ = editor_base()
    d = ImageDraw.Draw(img)
    # Match the current web editor header: no project export button; final output is Save PNG.
    d.rectangle((94, 18, 774, 58), fill="#ffffff")
    rr(d, (94, 18, 774, 58), 12, "#ffffff", "#e2e8f0")
    d.text((118, 31), "Lumoshot", fill="#111827", font=F16)
    d.text((218, 32), "Ready", fill="#94a3b8", font=F12)
    header_items = ["Frame", "Resize", "Theme", "Help", "Undo", "Redo", "Copy", "Save PNG"]
    x = 318
    for item in header_items:
        w = 42 if item not in ("Resize", "Save PNG") else 56
        rr(d, (x, 25, x + w, 51), 7, "#f8fafc", "#e2e8f0")
        d.text((x + 7, 33), item, fill="#334155", font=F10)
        x += w + 7
    if markup:
        d.line(((258, 306), (474, 242)), fill="#ef4444", width=6)
        arrow_head(d, (258, 306), (474, 242))
        rr(d, (494, 224, 638, 312), 4, None, "#ef4444", 5)
    return img


def gif_web_capture_overview():
    frames = []
    steps = [
        (web_landing_base(), "Web app starts from the Lumoshot home screen.", (522, 123)),
        (web_landing_base("capture"), "Click Capture screen to open the browser picker.", (522, 123)),
        (browser_picker_overlay(web_landing_base("capture")), "Choose another tab, window, or screen in the browser picker.", (492, 254)),
        (browser_picker_overlay(web_landing_base("capture"), "Docs window"), "Pick the target you want to capture, then share it.", (500, 350)),
        (web_editor_frame(), "The captured image opens in the editor.", (510, 246)),
    ]
    for img, text, cur in steps:
        d = ImageDraw.Draw(img)
        cursor(d, cur[0], cur[1])
        frames.append(label(img, text))
    return frames


def gif_web_capture_screen():
    frames = []
    steps = [
        (web_landing_base("capture"), "Click Capture screen on the web app home.", (522, 123)),
        (browser_picker_overlay(web_landing_base("capture")), "The browser asks what you want to share.", (492, 254)),
        (browser_picker_overlay(web_landing_base("capture"), "This tab"), "Select a tab, window, or screen and press Share.", (500, 350)),
        (web_editor_frame(), "Lumoshot captures the selected target and opens the editor.", (510, 246)),
        (web_editor_frame(markup=True), "Add annotations, then copy or save the PNG.", (640, 306)),
    ]
    for img, text, cur in steps:
        d = ImageDraw.Draw(img)
        cursor(d, cur[0], cur[1])
        frames.append(label(img, text))
    return frames


def line_gif(name, tool, color="#ef4444", width=5, points=None):
    points = points or [(260, 280), (360, 210), (504, 236)]
    frames = []
    for f in range(6):
        img, shot, _ = editor_base()
        d = ImageDraw.Draw(img)
        d.text((102, 68), tool, fill="#4f46e5", font=F12)
        n = max(2, round(2 + (len(points) - 2) * f / 5))
        p = points[:n]
        if f:
            end_x = lerp(points[n - 2][0], points[min(n - 1, len(points) - 1)][0], min(1, (f % 2 + 1) / 2))
            p = p[:-1] + [(end_x, points[min(n - 1, len(points) - 1)][1])]
        d.line(p, fill=color, width=width, joint="curve")
        cursor(d, int(p[-1][0]), int(p[-1][1]))
        frames.append(img)
    return frames


def gif_rect(rounded=False):
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        t = f / 5
        x1, y1 = 444, 236
        x2, y2 = int(lerp(x1, 626, t)), int(lerp(y1, 322, t))
        box = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
        rr(d, box, 16 if rounded else 2, None, "#ef4444", 5)
        cursor(d, x2, y2)
        frames.append(img)
    return frames


def gif_arrow():
    frames = []
    start, end = (254, 308), (470, 244)
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        t = f / 5
        p = (int(lerp(start[0], end[0], t)), int(lerp(start[1], end[1], t)))
        d.line((start, p), fill="#ef4444", width=6)
        if f > 2:
            arrow_head(d, start, p)
        cursor(d, p[0], p[1])
        frames.append(img)
    return frames


def gif_text():
    words = ["", "F", "Fix", "Fix label", "Fix label spacing"]
    frames = []
    for text in words:
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        d.text((402, 260), text + ("|" if text else ""), fill="#ef4444", font=F22)
        cursor(d, 390, 252)
        frames.append(img)
    return frames


def gif_bubble():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        t = f / 5
        box = (390, 170, int(lerp(430, 620, t)), int(lerp(202, 260, t)))
        rr(d, box, 18, "#ffffff", "#ef4444", 4)
        tip = (int(lerp(box[0] + 12, 498, t)), int(lerp(box[3], 314, t)))
        d.polygon([(430, box[3] - 2), (466, box[3] - 2), tip], fill="#ffffff", outline="#ef4444")
        d.text((box[0] + 18, box[1] + 22), "Explain this", fill="#111827", font=F16)
        cursor(d, tip[0], tip[1])
        frames.append(img)
    return frames


def gif_step():
    frames = []
    pts = [(260, 260), (452, 244), (594, 244)]
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        for i, (x, y) in enumerate(pts[: max(1, min(3, f))]):
            d.ellipse((x - 18, y - 18, x + 18, y + 18), fill="#ef4444", outline="#ffffff", width=3)
            d.text((x - 5, y - 10), str(i + 1), fill="#ffffff", font=F18)
        cursor(d, pts[min(2, f // 2)][0], pts[min(2, f // 2)][1])
        frames.append(img)
    return frames


def gif_click():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        x, y = 552, 236
        cursor(d, x, y)
        if f > 1:
            for i in range(5):
                ang = -1.0 + i * 0.35
                r = 18 + f * 3
                d.line((x + 22, y + 10, x + 22 + math.cos(ang) * r, y + 10 + math.sin(ang) * r), fill="#111827", width=2)
        frames.append(img)
    return frames


def gif_spotlight(ellipse=False):
    frames = []
    for f in range(6):
        img, shot, _ = editor_base()
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 255))
        mask = Image.new("L", img.size, int(f * 34))
        md = ImageDraw.Draw(mask)
        box = (504, 228, 648, 314)
        if ellipse:
            md.ellipse(box, fill=0)
        else:
            md.rounded_rectangle(box, radius=4, fill=0)
        overlay.putalpha(mask)
        img.alpha_composite(overlay)
        d = ImageDraw.Draw(img)
        if ellipse:
            d.ellipse(box, outline="#facc15", width=4)
        else:
            rr(d, box, 4, None, "#facc15", 4)
        cursor(d, 650, 318)
        frames.append(img)
    return frames


def gif_blur():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        box = (498, 248, int(lerp(500, 652, f / 5)), int(lerp(250, 336, f / 5)))
        if f > 1:
            region = img.crop(box).filter(ImageFilter.GaussianBlur(7))
            img.paste(region, box)
        d = ImageDraw.Draw(img)
        rr(d, box, 4, None, "#111827", 3)
        cursor(d, box[2], box[3])
        frames.append(img)
    return frames


def gif_zoom(ellipse=False):
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        src = (236, 246, 332, 316)
        if ellipse:
            d.ellipse(src, outline="#4f46e5", width=4)
        else:
            rr(d, src, 4, None, "#4f46e5", 4)
        panel = (int(lerp(500, 430, f / 5)), int(lerp(278, 158, f / 5)), int(lerp(570, 672, f / 5)), int(lerp(330, 300, f / 5)))
        rr(d, panel, 12, "#ffffff", "#4f46e5", 5)
        d.text((panel[0] + 24, panel[1] + 34), "Zoomed detail", fill="#111827", font=F18)
        d.line((src[2], src[1], panel[0], panel[1] + 20), fill="#4f46e5", width=2)
        cursor(d, panel[2], panel[3])
        frames.append(img)
    return frames


def gif_header_frame():
    return [label(editor_base(framed=f >= 2)[0], "Frame adds padding and a polished shadow.") for f in range(5)]


def gif_zoom_theme():
    frames = []
    for i, (theme, zoom) in enumerate([("light", "100%"), ("light", "125%"), ("light", "150%"), ("dark", "150%"), ("dark", "90%")]):
        frames.append(label(editor_base(theme, zoom)[0], "Zoom and theme controls change the workspace."))
    return frames


def gif_undo_redo():
    frames = []
    states = [0, 1, 0, 1, 2]
    for s in states:
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        if s >= 1:
            d.line(((250, 306), (470, 238)), fill="#ef4444", width=6)
            arrow_head(d, (250, 306), (470, 238))
        if s >= 2:
            rr(d, (494, 224, 636, 312), 3, None, "#ef4444", 5)
        frames.append(label(img, ["Start", "Undo removes it", "Redo brings it back"][min(s, 2)]))
    return frames


def gif_copy_save():
    frames = []
    for f in range(5):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        if f in (1, 2):
            rr(d, (664, 25, 708, 51), 7, "#eef2ff", "#4f46e5", 2)
            frames.append(label(img, "Copy sends the rendered PNG to clipboard."))
        else:
            rr(d, (715, 25, 760, 51), 7, "#4f46e5")
            frames.append(label(img, "Save downloads a polished PNG."))
    return frames


def gif_insert():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        size = int(lerp(32, 104, f / 5))
        box = (520 - size // 2, 266 - size // 2, 520 + size // 2, 266 + size // 2)
        rr(d, box, 10, "#dbeafe", "#2563eb", 3)
        d.ellipse((box[0] + 12, box[1] + 12, box[0] + 32, box[1] + 32), fill="#facc15")
        d.polygon([(box[0] + 18, box[3] - 18), (box[0] + 52, box[1] + 46), (box[2] - 14, box[3] - 18)], fill="#22c55e")
        cursor(d, box[2], box[3])
        frames.append(img)
    return frames


def gif_resize():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        panel = (500, 92, 724, 350)
        shadow_card(img, panel, 14, "#ffffff")
        d.text((524, 116), "Resize", fill="#111827", font=F22)
        d.text((524, 160), "Width", fill="#64748b", font=F12)
        rr(d, (584, 154, 690, 184), 7, "#f8fafc", "#dbe3ef")
        d.text((604, 162), str(int(lerp(1280, 900, f / 5))), fill="#111827", font=F14)
        d.text((524, 204), "Height", fill="#64748b", font=F12)
        rr(d, (584, 198, 690, 228), 7, "#f8fafc", "#dbe3ef")
        d.text((604, 206), str(int(lerp(760, 540, f / 5))), fill="#111827", font=F14)
        rr(d, (584, 290, 690, 324), 8, "#4f46e5")
        d.text((622, 300), "Apply", fill="#ffffff", font=F12)
        cursor(d, 692, 324)
        frames.append(img)
    return frames


def gif_crop():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        if f < 4:
            box = (212, 146, int(lerp(260, 650, f / 3)), int(lerp(190, 334, f / 3)))
            d.rectangle(box, outline="#4f46e5", width=4)
            d.rectangle((box[0], box[1] - 28, box[2], box[1]), fill="#4f46e5")
            d.text((box[0] + 10, box[1] - 22), "Drag crop area", fill="#ffffff", font=F12)
            cursor(d, box[2], box[3])
        else:
            d.rectangle((116, 84, 748, 396), fill="#edf2f7")
            dashboard(d, (180, 120, 682, 348), compact=True)
            label(img, "Crop keeps only the selected region.")
        frames.append(img)
    return frames


def gif_before_after():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        split = int(lerp(156, 432, f / 5))
        rr(d, (138, 106, 728, 368), 10, "#ffffff", "#dbe3ef")
        d.rectangle((138, 106, split, 368), fill="#ffffff")
        d.rectangle((split, 106, 728, 368), fill="#f8fafc")
        d.text((238, 128), "BEFORE", fill="#64748b", font=F14)
        d.text((520, 128), "AFTER", fill="#64748b", font=F14)
        rr(d, (204, 196, 360, 276), 8, "#fee2e2", "#ef4444", 3)
        rr(d, (484, 196, 640, 276), 8, "#dcfce7", "#16a34a", 3)
        d.line((split, 106, split, 368), fill="#94a3b8", width=3)
        frames.append(img)
    return frames


def gif_power():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        for i, x in enumerate([230, 360, 505]):
            y = int(lerp(230 + i * 24, 244, f / 5))
            rr(d, (x, y, x + 88, y + 54), 8, None, "#4f46e5", 4)
            if f > 3:
                rr(d, (x + 18, y + 76, x + 106, y + 130), 8, None, "#94a3b8", 3)
        if f > 2:
            d.line((210, 244, 640, 244), fill="#22c55e", width=2)
        if f > 4:
            d.text((596, 168), "Locked", fill="#64748b", font=F14)
        frames.append(img)
    return frames


def gif_header_overview():
    frames = []
    for f in range(5):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        x = [318, 367, 428, 477, 526][f]
        rr(d, (x - 4, 21, x + 62, 55), 8, None, "#4f46e5", 3)
        frames.append(label(img, "Top bar keeps frame, resize, help, export, undo, copy, and save close."))
    return frames


def gif_select():
    frames = []
    for f in range(6):
        img, _, _ = editor_base()
        d = ImageDraw.Draw(img)
        dx = int(lerp(0, 90, f / 5))
        rr(d, (300 + dx, 224, 450 + dx, 292), 6, None, "#ef4444", 5)
        d.rectangle((294 + dx, 218, 456 + dx, 298), outline="#2563eb", width=2)
        for x, y in [(294 + dx, 218), (456 + dx, 218), (294 + dx, 298), (456 + dx, 298)]:
            d.ellipse((x - 5, y - 5, x + 5, y + 5), fill="#ffffff", outline="#2563eb", width=2)
        cursor(d, 456 + dx, 298)
        frames.append(img)
    return frames


def write_gifs():
    features: dict[str, Callable[[], list[Image.Image]]] = {
        "popup-overview.gif": gif_web_capture_overview,
        "capture-visible.gif": gif_web_capture_screen,
        "capture-selected.gif": gif_crop,
        "capture-entire.gif": lambda: mk_landing(["Use system capture for desktop apps.", "Pick a window or screen.", "The image opens in Lumoshot.", "Finish with copy or save."]),
        "capture-local.gif": lambda: mk_landing(["Drop an image on the page.", "Paste from clipboard.", "Upload PNG or JPEG.", "Start editing immediately."]),
        "header-overview.gif": gif_header_overview,
        "header-frame.gif": gif_header_frame,
        "header-zoom-theme.gif": gif_zoom_theme,
        "header-undo-redo.gif": gif_undo_redo,
        "header-copy-save.gif": gif_copy_save,
        "tool-select.gif": gif_select,
        "tool-rect.gif": lambda: gif_rect(False),
        "tool-rounded-rect.gif": lambda: gif_rect(True),
        "tool-arrow.gif": gif_arrow,
        "tool-arrow-curved.gif": lambda: line_gif("tool-arrow-curved.gif", "Curved Arrow", "#ef4444", 5, [(238, 316), (348, 196), (474, 304), (620, 206)]),
        "tool-arrow-elbow.gif": lambda: line_gif("tool-arrow-elbow.gif", "Elbow Arrow", "#ef4444", 5, [(238, 316), (360, 316), (360, 218), (620, 218)]),
        "tool-speech-bubble.gif": gif_bubble,
        "tool-text.gif": gif_text,
        "tool-step-number.gif": gif_step,
        "tool-click-icon.gif": gif_click,
        "tool-pen.gif": lambda: line_gif("tool-pen.gif", "Pen", "#ef4444", 4, [(250, 286), (290, 252), (326, 302), (378, 246), (430, 286)]),
        "tool-highlighter.gif": lambda: line_gif("tool-highlighter.gif", "Highlighter", "#facc15", 12, [(238, 314), (340, 292), (456, 292), (594, 280)]),
        "tool-spotlight-rect.gif": lambda: gif_spotlight(False),
        "tool-spotlight-ellipse.gif": lambda: gif_spotlight(True),
        "tool-blur.gif": gif_blur,
        "tool-zoom-rect.gif": lambda: gif_zoom(False),
        "tool-zoom-ellipse.gif": lambda: gif_zoom(True),
        "tool-insert-image.gif": gif_insert,
        "tool-resize.gif": gif_resize,
        "tool-crop.gif": gif_crop,
        "tool-before-after.gif": gif_before_after,
        "power-align-duplicate.gif": gif_power,
    }
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)

    requested = set(sys.argv[1:])
    if requested:
        unknown = requested - set(features)
        if unknown:
            raise SystemExit(f"Unknown guide GIF(s): {', '.join(sorted(unknown))}")

    for filename, maker in features.items():
        if requested and filename not in requested:
            continue
        frames = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=96) for frame in maker()]
        for out_dir in OUT_DIRS:
            path = out_dir / filename
            frames[0].save(
                path,
                save_all=True,
                append_images=frames[1:],
                duration=360,
                loop=0,
                optimize=True,
                disposal=2,
            )
        print(filename)


if __name__ == "__main__":
    write_gifs()
