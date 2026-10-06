#!/bin/sh

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if rg -n 'impeccable-20|lnh-shared-release\.css|lnh-impeccable-20\.css' "$root/public" --glob '*.html' --glob '!**/admin/**'; then
  echo "Unexpected preview styling found in published HTML." >&2
  exit 1
fi

pages='index brief direction build curation care edit partnership about stories'
required_style_ids='lnh-mobile-hero-cta-gap-sync
lnh-dark-ad-headline-mobile-sync
lnh-mobile-dark-cta-button-room-sync
lnh-mobile-footer-legal-sync
lnh-mobile-footer-spacing-sync
lnh-process-number-size-sync
lnh-footer-signature-gap-desktop-sync
lnh-footer-legal-desktop-line-sync
lnh-about-headline-size-sync
lnh-section-content-hierarchy-sync
lnh-price-info-scale-sync
lnh-global-section-hierarchy-final-sync
lnh-dark-section-spacing-sync
lnh-section-eyebrow-size-sync
lnh-nav-uniform-body-final-sync
lnh-ad-cta-center-second-release
lnh-contact-ad-center-second-release
lnh-dark-statement-center-second-release
lnh-dark-statement-width-center-second-release
lnh-hero-headline-54px-second-release
lnh-cta-button-font-weight-reset-second-release'

for page in $pages; do
  file="$root/public/$page.html"
  echo "$required_style_ids" | while IFS= read -r style_id; do
    if ! rg -q "<style id=\"$style_id\">" "$file"; then
      echo "Missing published style $style_id in $page.html." >&2
      exit 1
    fi
  done
done

echo "Published style baseline is clean."
