from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PAGES = [
    "index",
    "brief",
    "direction",
    "build",
    "curation",
    "care",
    "edit",
    "partnership",
    "about",
    "stories",
]
STYLE_IDS = [
    "lnh-about-headline-size-sync",
    "lnh-ad-cta-center-second-release",
    "lnh-contact-ad-center-second-release",
    "lnh-cta-button-font-weight-reset-second-release",
    "lnh-dark-ad-headline-mobile-sync",
    "lnh-dark-section-spacing-sync",
    "lnh-dark-statement-center-second-release",
    "lnh-dark-statement-width-center-second-release",
    "lnh-footer-legal-desktop-line-sync",
    "lnh-footer-signature-gap-desktop-sync",
    "lnh-global-section-hierarchy-final-sync",
    "lnh-hero-headline-54px-second-release",
    "lnh-mobile-dark-cta-button-room-sync",
    "lnh-mobile-footer-legal-sync",
    "lnh-mobile-footer-spacing-sync",
    "lnh-mobile-hero-cta-gap-sync",
    "lnh-nav-uniform-body-final-sync",
    "lnh-price-info-scale-sync",
    "lnh-process-number-size-sync",
    "lnh-section-content-hierarchy-sync",
    "lnh-section-eyebrow-size-sync",
]


def style_pattern(style_id: str) -> re.Pattern[str]:
    return re.compile(
        rf"\s*<style id=\"{re.escape(style_id)}\">(.*?)</style>\s*",
        re.DOTALL,
    )


sources = {name: (PUBLIC / f"{name}.html").read_text() for name in PAGES}
blocks: dict[str, str] = {}

for style_id in STYLE_IDS:
    values = []
    for name, source in sources.items():
        match = style_pattern(style_id).search(source)
        if not match:
            raise RuntimeError(f"{style_id} is missing from {name}.html")
        values.append(match.group(1).strip())
    if any(value != values[0] for value in values[1:]):
        raise RuntimeError(f"{style_id} differs between pages")
    blocks[style_id] = values[0]

shared_css = "\n\n".join(
    f"/* {style_id} */\n{blocks[style_id]}" for style_id in STYLE_IDS
) + "\n"
(PUBLIC / "assets" / "lnh-shared-release.css").write_text(shared_css)

link = '<link rel="stylesheet" href="assets/lnh-shared-release.css?v=20260929">\n'
anchor = '<link rel="stylesheet" href="assets/lnh-impeccable-20.css?v=20260929">'

for name, source in sources.items():
    for style_id in STYLE_IDS:
        source, count = style_pattern(style_id).subn("\n", source, count=1)
        if count != 1:
            raise RuntimeError(f"Failed to remove {style_id} from {name}.html")
    if "lnh-shared-release.css" not in source:
        if anchor not in source:
            raise RuntimeError(f"Impeccable stylesheet anchor missing from {name}.html")
        source = source.replace(anchor, link + anchor, 1)
    (PUBLIC / f"{name}.html").write_text(source)

print(f"Extracted {len(STYLE_IDS)} shared blocks from {len(PAGES)} pages")
