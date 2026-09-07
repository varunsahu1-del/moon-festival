"""Build the Moon Festival 2026 partnership deck.

Two outputs from one template:
  1. partnerships.html + assets/partnerships/*.webp  -> the live site page (light, cached, lazy-loaded)
  2. sponsor-deck.html                               -> single self-contained file (artifact / PDF)

Run:  python3 build_sponsor.py
"""
import base64, io, os, json, shutil
import html as _html
from PIL import Image

HERE      = os.path.dirname(os.path.abspath(__file__))
SITE      = os.path.dirname(HERE)
ASSET_DIR = os.path.join(SITE, "assets", "partnerships")
ASSET_URL = "/assets/partnerships"
FACROOT   = SITE
FAVICON   = os.path.join(SITE, "Favicons", "Yellow Transparency.png")

WEBP_Q   = 72     # visually indistinguishable at these display sizes, ~28% under JPEG q80
FACSCALE = 0.8    # facilitator cards render at 176px; 304px still covers ~1.7x

# ── content ────────────────────────────────────────────────────────────────
HERO      = ("hero_src.jpg", 1600, "photo photo-hero", "Moon 2025 · the main stage.")
hand      = [("mk/2025-stage.jpg", 0.80), ("mk/14.jpg", 0.50)]
hand_cap  = "Built on-site over months — earth, bamboo, rope, palm and leaf, all by hand."
sess      = ["sess/mg103.jpg","sess/mg125.jpg","sess/mf156.jpg",
             "sess/mf18.jpg","sess/mf151.jpg"]
sess_cap  = "Workshops &amp; Ceremonies · Moon 2025."
fac_data  = json.load(open(os.path.join(HERE,"fac.json")))

# previous partners — logo strip + activation proof
plogos_row1 = [("logo_riseup_round.png", "Rise Up Kombucha"),
               ("logo_shroom.jpg",       "Shroom Shroom"),
               ("logo_vranda.png",       "Vranda")]
plogos_row2 = [("logo_dryad.png",        "Dryad by Parisa"),
               ("logo_neemli.png",       "Neemli Naturals"),
               ("logo_xech.png",         "Xech")]
pshots = [
    ("dryad", [("act_dryad_a.jpg", 0.5), ("act_dryad_b.jpg", 0.5), ("act_dryad_c.jpg", 0.5)],
     "<strong>Dryad by Parisa</strong> — handcrafted jewellery, worn and taken home by guests."),
    ("riseup", [("act_riseup_a.jpg", 0.1), ("act_riseup_b.jpg", 0.0), ("act_riseup_c.jpg", 0.1)],
     "<strong>Rise Up Kombucha</strong> poured through the festival — in circles, after sessions, in guests\' hands for three days."),
    ("shroom", [("act_shroom_b.jpg", 0.4), ("act_shroom_a.jpg", 0.3), ("act_shroom_c.jpg", 0.3)],
     "<strong>Shroom Shroom</strong> — their own stall at the Moon Market, 420 guests."),
]


def crop32(path, focus):
    """Crop to 3:2, placing the band at `focus` (0=top, 1=bottom) of the leftover height."""
    im = Image.open(path if os.path.isabs(path) else os.path.join(HERE, path)).convert("RGB")
    ch = round(im.width / 1.5)
    if ch <= im.height:
        top = round((im.height - ch) * focus)
        return im.crop((0, top, im.width, top + ch))
    cw = round(im.height * 1.5)
    left = round((im.width - cw) / 2)
    return im.crop((left, 0, left + cw, im.height))


def emit_logo(emit, path, name):
    """Logos are transparent PNGs — flatten onto white, trim, then hand to the emitter."""
    from PIL import ImageChops
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    rgb = bg.convert("RGB")
    box = ImageChops.difference(rgb, Image.new("RGB", rgb.size, (255, 255, 255))).getbbox()
    if box:
        rgb = rgb.crop(box)
    return emit(None, 420, name, im=rgb)


class Emitter:
    """Returns an <img src> for a source image — inline data URI, or a written asset file."""

    def __init__(self, inline, scale=1.0, quality=None):
        self.inline = inline
        self.scale = scale
        self.quality = quality or WEBP_Q
        self.bytes = 0
        if not inline:
            os.makedirs(ASSET_DIR, exist_ok=True)

    def __call__(self, src, maxw, name, im=None):
        if im is None:
            im = Image.open(src if os.path.isabs(src) else os.path.join(HERE, src)).convert("RGB")
        maxw = round(maxw * self.scale)
        if im.width > maxw:
            im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=self.quality, method=6)
        self.bytes += buf.tell()
        if self.inline:
            return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
        with open(os.path.join(ASSET_DIR, name + ".webp"), "wb") as fh:
            fh.write(buf.getvalue())
        return f"{ASSET_URL}/{name}.webp"


def build(inline, scale=1.0, quality=None):
    emit = Emitter(inline, scale, quality)
    html = open(os.path.join(HERE,"sponsor.template.html")).read()

    # fonts stay inline in both builds — 130KB total, and avoids a flash of fallback type
    html = html.replace("__LATIN_B64__",    open(os.path.join(HERE,"fonts","os-latin.b64")).read().strip())
    html = html.replace("__LATINEXT_B64__", open(os.path.join(HERE,"fonts","os-latinext.b64")).read().strip())
    html = html.replace("__JOSEFIN_B64__",  open(os.path.join(HERE,"fonts","josefin-latin.b64")).read().strip())

    fav = Image.open(FAVICON).convert("RGBA"); fav.thumbnail((64, 64), Image.LANCZOS)
    fb = io.BytesIO(); fav.save(fb, "PNG", optimize=True)
    html = html.replace("__FAVICON_B64__", base64.b64encode(fb.getvalue()).decode())

    # hero — above the fold, so eager + high priority
    path, mw, cls, cap = HERO
    src = emit(path, mw, "hero")
    html = html.replace("<!--IMG_HERO-->",
        f'<figure style="margin:0"><img class="{cls}" src="{src}" alt="{cap}" '
        f'fetchpriority="high" decoding="async">'
        f'<figcaption class="pcap">{cap}</figcaption></figure>')

    # made by hand — two full-width frames
    cells = ""
    for i, (p, focus) in enumerate(hand):
        s = emit(p, 1400, f"hand{i+1}", im=crop32(p, focus))
        cells += (f'<img src="{s}" alt="Moon Festival — built by hand" '
                  f'loading="lazy" decoding="async">')
    html = html.replace("<!--IMG_ORGANIC-->",
        f'<figure style="margin:0"><div class="hgrid">{cells}</div>'
        f'<figcaption class="pcap">{hand_cap}</figcaption></figure>')

    # 2026 — six sessions, two per row
    cells = ""
    for i, p in enumerate(sess):
        s = emit(p, 700, f"sess{i+1}")
        cells += (f'<div style="flex:0 0 82%;scroll-snap-align:start;">'
                  f'<img src="{s}" alt="Moon Festival workshop" '
                  f'style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;display:block;" '
                  f'loading="lazy" decoding="async"></div>')
    html = html.replace("<!--IMG_THISYEAR-->",
        f'<figure style="margin:24px 0 0">'
        f'<div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;'
        f'-webkit-overflow-scrolling:touch;scrollbar-width:none;">{cells}</div>'
        f'<figcaption class="pcap">{sess_cap}</figcaption></figure>')



    # facilitator carousel — all off-screen at load, so every one lazy-loads
    cards, missing = "", []
    for i, f in enumerate(fac_data):
        p = os.path.join(FACROOT, f["img"])
        if not os.path.exists(p):
            missing.append(f["img"]); continue
        s = emit(p, round(380 * FACSCALE), f"fac{i+1:02d}")
        cards += (f'<div class="fcard">'
                  f'<img src="{s}" alt="{_html.escape(f["name"])}" '
                  f'style="object-position:{f["pos"]}" loading="lazy" decoding="async">'
                  f'<div class="fcard-ov"></div>'
                  f'<div class="fcard-info">'
                  f'<p class="fcard-name">{_html.escape(f["name"])}</p>'
                  f'<p class="fcard-role">{_html.escape(f["role"])}</p></div></div>')
    if missing:
        print("  MISSING:", missing)

    html = html.replace("<!--IMG_FACIL_GRID-->",
      '<div class="fcar-wrap">'
      '<button class="fcar-btn fcar-prev" aria-label="Previous facilitators">&#8249;</button>'
      f'<div class="fcar" id="fcar">{cards}</div>'
      '<button class="fcar-btn fcar-next" aria-label="More facilitators">&#8250;</button>'
      '</div>'
      f'<p class="fcar-hint">{len(fac_data)-len(missing)} facilitators &amp; acts '
      '— scroll to see them all →</p>'
      '<script>(function(){var c=document.getElementById("fcar");if(!c)return;'
      'function step(d){c.scrollBy({left:d*(c.clientWidth*0.8),behavior:"smooth"});}'
      'document.querySelector(".fcar-prev").onclick=function(){step(-1)};'
      'document.querySelector(".fcar-next").onclick=function(){step(1)};})();</script>')

    # return on experience hero — higher quality to preserve vivid colours
    roe_emit = Emitter(inline, scale=1.0, quality=90)
    roe_src = roe_emit(os.path.join(HERE, "partners", "roe_hero.png"), 1400, "roe_hero")
    emit.bytes += roe_emit.bytes
    html = html.replace("<!--IMG_ROE_HERO-->",
        f'<figure style="margin:28px 0"><img src="{roe_src}" alt="Moon Market — guests at Moon Festival 2025" '
        f'style="width:100%;border-radius:12px;aspect-ratio:16/8;object-fit:cover;display:block;" '
        f'loading="lazy" decoding="async"></figure>')

    # founder — B&W portrait (full width) + two session photos
    s1 = emit(os.path.join(HERE, "partners", "founder_a.png"), 1400, "founder1",
              im=crop32(os.path.join(HERE, "partners", "founder_a.png"), 0.3))
    html = html.replace("<!--IMG_FOUNDER_1-->",
        f'<img class="founder-photo1" src="{s1}" alt="Varun Sahu" loading="lazy" decoding="async">')
    s2 = emit(os.path.join(HERE, "partners", "founder_c.jpg"), 700, "founder2",
              im=crop32(os.path.join(HERE, "partners", "founder_c.jpg"), 0.3))
    s3 = emit(os.path.join(HERE, "partners", "founder_b.jpg"), 700, "founder3",
              im=crop32(os.path.join(HERE, "partners", "founder_b.jpg"), 0.2))
    s4 = emit(os.path.join(HERE, "partners", "founder_d.jpg"), 700, "founder4",
              im=crop32(os.path.join(HERE, "partners", "founder_d.jpg"), 0.3))
    html = html.replace("<!--IMG_FOUNDER_23-->",
        f'<figure><img src="{s2}" alt="Philosophy session at Moon Festival" loading="lazy" decoding="async">'
        f'<figcaption>Philosophy session by Varun</figcaption></figure>'
        f'<figure><img src="{s3}" alt="Yoga session at Moon Festival" loading="lazy" decoding="async">'
        f'<figcaption>Yoga session by Varun</figcaption></figure>'
        f'<figure><img src="{s4}" alt="Psychic sleep session at Moon Festival" loading="lazy" decoding="async">'
        f'<figcaption>Psychic sleep session by Varun</figcaption></figure>')

    # previous partners — logos on white, activation photos
    def render_logo_row(items, cls="plogos"):
        row = ""
        for fn, alt in items:
            src = emit_logo(emit, os.path.join(HERE, "partners", fn), fn.rsplit(".", 1)[0])
            row += f'<img src="{src}" alt="{_html.escape(alt)}" loading="lazy" decoding="async">'
        return f'<div class="{cls}">{row}</div>'
    logo_html = render_logo_row(plogos_row1) + render_logo_row(plogos_row2, "plogos plogos-row2")
    html = html.replace("<!--IMG_PLOGOS-->", logo_html)

    photo_slides = ""
    brand_labels = {"dryad": "Dryad by Parisa", "riseup": "Rise Up Kombucha", "shroom": "Shroom Shroom"}
    for brand_key, photos, cap in pshots:
        for fn, focus in photos:
            src = emit(os.path.join(HERE, "partners", fn), 600, f"pshot_{brand_key}_{fn.split('.')[0]}")
            label = brand_labels[brand_key]
            photo_slides += (f'<figure style="flex:0 0 72%;scroll-snap-align:start;margin:0;">'
                             f'<img src="{src}" alt="{label}" '
                             f'style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block;" '
                             f'loading="lazy" decoding="async">'
                             f'<figcaption style="font-size:0.78rem;color:var(--soft);margin-top:7px;'
                             f'letter-spacing:0.04em;text-transform:uppercase;">{label}</figcaption>'
                             f'</figure>')
    html = html.replace("<!--IMG_PSHOTS-->",
        f'<div style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;'
        f'-webkit-overflow-scrolling:touch;scrollbar-width:none;margin-top:28px;">'
        f'{photo_slides}</div>')

    assert "<!--IMG" not in html, "unreplaced image marker"
    return html, emit.bytes


PRINT_CSS = """
<style>
  @page { size: A4; margin: 0; }
  @media print {
    .hero { padding: 48px 40px 30px !important; }
    .page { max-width: 100% !important; padding: 0 40px !important; }
    section { padding: 30px 0 !important; break-inside: avoid; }
    .tier, .dcol, .make, .contact, .stats, figure, .pgrid, .fgrid, .mk, .dr-grid { break-inside: avoid; }
    /* carousel can't paginate — unroll it into a grid so all cards reach the PDF */
    .fcar { display: grid !important; grid-template-columns: repeat(5, 1fr) !important;
            gap: 3px !important; overflow: visible !important; }
    .fcard { width: auto !important; }
    .fcar-btn, .fcar-hint, .totop { display: none !important; }
    .photo-hero { aspect-ratio: 16/7.6 !important; }
    h1,h2 { break-after: avoid; }
  }
</style>
"""

# 1. live site page — external assets
site_html, site_img = build(inline=False)
open(os.path.join(SITE, "partnerships.html"), "w").write(site_html)

# 2. self-contained — artifact / PDF
solo_html, solo_img = build(inline=True)
open(os.path.join(HERE,"out","sponsor-deck.html"), "w").write(solo_html)

# 3. print source — smaller images; Chrome re-encodes them into the PDF inefficiently
print_html, print_img = build(inline=True, scale=0.55, quality=62)
open(os.path.join(HERE,"out","sponsor-print.html"), "w").write(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + PRINT_CSS + '</head><body>' + print_html + '</body></html>')

n_assets = len([f for f in os.listdir(ASSET_DIR) if f.endswith(".webp")])
print(f"site : partnerships.html {len(site_html)//1024}KB + {n_assets} assets ({site_img//1024}KB)")
print(f"solo : sponsor-deck.html {len(solo_html)//1024}KB (images inlined)")
print(f"print: sponsor-print.html {len(print_html)//1024}KB ({print_img//1024}KB imgs)")
