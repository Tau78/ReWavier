#!/usr/bin/env python3
"""Panoramic App Store promo: one wide image sliced into 3 seamless panels."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
IN_DIR = ROOT / "assets/store/iphone"
OUT_DIR = ROOT / "assets/store/iphone/promo"

PANEL_W = 1284
PANEL_H = 2778
MASTER_W = PANEL_W * 3
MASTER_H = PANEL_H

ORANGE = (255, 107, 53)
BLUE = (74, 158, 255)
BLUE_SOFT = (168, 198, 232)
ORANGE_SOFT = (255, 150, 110)
WHITE = (255, 255, 255)
SHADOW = (0, 0, 0, 90)

# Diagonal across the full panorama (same line on all 3 panels)
DIAG_A = (0, 180)
DIAG_B = (MASTER_W, MASTER_H - 220)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/SFNSDisplay-Bold.otf",
        "/System/Library/Fonts/SFNSText-Bold.otf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def panoramic_background() -> Image.Image:
    img = Image.new("RGB", (MASTER_W, MASTER_H), BLUE_SOFT)
    draw = ImageDraw.Draw(img)
    top_edge = [(0, 0), (MASTER_W, 0)]
    diag_pts = []
    for x in range(MASTER_W, -1, -1):
        if x <= DIAG_A[0]:
            y_cross = DIAG_A[1]
        elif x >= DIAG_B[0]:
            y_cross = DIAG_B[1]
        else:
            t = (x - DIAG_A[0]) / (DIAG_B[0] - DIAG_A[0])
            y_cross = DIAG_A[1] + t * (DIAG_B[1] - DIAG_A[1])
        diag_pts.append((x, int(y_cross)))
    draw.polygon(top_edge + diag_pts, fill=ORANGE)
    return img


def rounded(shot: Image.Image, radius: int = 44) -> Image.Image:
    w, h = shot.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(shot, (0, 0), mask)
    return out


def phone_from_file(path: Path, target_w: int) -> Image.Image:
    shot = Image.open(path).convert("RGB")
    target_h = int(shot.height * target_w / shot.width)
    shot = shot.resize((target_w, target_h), Image.Resampling.LANCZOS)
    rgba = rounded(shot)
    w, h = rgba.size
    bezel = Image.new("RGBA", (w + 8, h + 8), (20, 20, 22, 255))
    bezel.paste(rgba, (4, 4), rgba)
    return rounded(bezel.convert("RGB"), radius=48).convert("RGBA")


def drop_shadow(layer: Image.Image, offset: tuple[int, int] = (0, 28), blur: int = 32) -> Image.Image:
    w, h = layer.size
    shadow = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    alpha = layer.split()[3]
    sil = Image.new("RGBA", layer.size, SHADOW)
    sil.putalpha(alpha)
    shadow.paste(sil, (40 + offset[0], 40 + offset[1]), sil)
    return shadow.filter(ImageFilter.GaussianBlur(blur))


def paste_phone(canvas: Image.Image, phone: Image.Image, xy: tuple[int, int], angle: float = 0) -> None:
    if angle:
        phone = phone.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    shadow = drop_shadow(phone)
    canvas.alpha_composite(shadow, (xy[0] - 20, xy[1] - 10))
    canvas.alpha_composite(phone, xy)


def draw_headline(
    canvas: Image.Image,
    lines: list[str],
    *,
    x: int,
    y: int,
    size: int = 92,
    align: str = "left",
    panel_w: int = PANEL_W,
) -> None:
    draw = ImageDraw.Draw(canvas)
    font = load_font(size)
    line_h = int(size * 1.08)
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        if align == "center":
            tx = x + (panel_w - tw) // 2
        elif align == "right":
            tx = x + panel_w - tw - 72
        else:
            tx = x
        draw.text((tx, y + i * line_h), line, font=font, fill=WHITE)


def build_master() -> Image.Image:
    canvas = panoramic_background().convert("RGBA")

    phone1 = phone_from_file(IN_DIR / "01-player-appunto-1284x2778.png", 600)
    paste_phone(canvas, phone1, (PANEL_W * 0 + 120, MASTER_H - phone1.size[1] + 80), angle=-14)

    phone2 = phone_from_file(IN_DIR / "02-nuovo-appunto-1284x2778.png", 560)
    px2 = PANEL_W + (PANEL_W - phone2.size[0]) // 2
    paste_phone(canvas, phone2, (px2, int(MASTER_H * 0.20)), angle=0)

    phone3 = phone_from_file(IN_DIR / "04-album-tracce-1284x2778.png", 600)
    paste_phone(canvas, phone3, (PANEL_W * 2 + 80, MASTER_H - phone3.size[1] + 60), angle=12)

    # Text sits in each panel column of the same panorama
    draw_headline(canvas, ["APPUNTI SUL", "SECONDO ESATTO"], x=72, y=200, size=96, panel_w=PANEL_W)
    draw_headline(
        canvas,
        ["SCRIVI NEL", "MOMENTO GIUSTO"],
        x=PANEL_W,
        y=MASTER_H - 340,
        size=96,
        align="center",
        panel_w=PANEL_W,
    )
    draw_headline(canvas, ["ORGANIZZA", "I TUOI BRANI"], x=PANEL_W * 2 + 80, y=200, size=96, panel_w=PANEL_W)

    return canvas


def slice_panels(master: Image.Image) -> list[Image.Image]:
    return [master.crop((i * PANEL_W, 0, (i + 1) * PANEL_W, MASTER_H)).convert("RGB") for i in range(3)]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = build_master()
    master_path = OUT_DIR / "panorama-master-3852x2778.png"
    master.convert("RGB").save(master_path, "PNG", optimize=True)
    print(f"Wrote {master_path}")

    names = [
        "01-player-promo-1284x2778.png",
        "02-appunto-promo-1284x2778.png",
        "03-album-promo-1284x2778.png",
    ]
    for name, panel in zip(names, slice_panels(master)):
        out = OUT_DIR / name
        panel.save(out, "PNG", optimize=True)
        print(f"Wrote {out}")


if __name__ == "__main__":
    main()
