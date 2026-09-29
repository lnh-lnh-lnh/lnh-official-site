# LNH Impeccable Web Pilot

Date: 2026-09-29  
Status: isolated experiment; not published  
Production baseline: `e1f523ad4b98eb54ba1f814ce974a83fdf8f6c4d`

## Safety boundary

- The current production site was not edited or deployed.
- The production source was saved as a complete Git bundle under `baselines/lnh-production-20260929`.
- The pilot lives only on `codex/impeccable-pilot-20260929`.
- The pilot repository cannot push to the production remote.
- Brand copy, navigation, information architecture, and the home hero were not changed.

## Tested improvements

| Option | Commit | Scope | Result |
| --- | --- | --- | --- |
| A | `e4fb5a0` | Touch targets and small-text contrast | 44px targets added to primary controls; secondary text contrast raised |
| B | `bcf4d27` | Reduced-motion support | Active service-hero animations stop when the visitor requests reduced motion |
| C | `06c8af5` | Initial image payload | Direction and About images optimized; Edit below-fold images load only when needed |

Each option can be accepted independently by cherry-picking its commit. Accepting A+B+C reproduces the complete pilot.

## Measured result

The same six routes were rendered at `1440x900`, `1280x800`, and `393x852` with reduced motion enabled.

| Measure | Published baseline | Impeccable pilot |
| --- | ---: | ---: |
| Render checks | 18 | 18 |
| HTTP failures | 0 | 0 |
| Console errors | 0 | 0 |
| Horizontal overflow | 0 | 0 |
| Running animations under reduced motion | 6 | 0 |
| Visible controls below 44px | 386 | 360 |
| Direction lead image transfer | 2.62 MB | 0.50 MB |
| Edit mobile initial image transfer | 3.80 MB | 0.61 MB |

The full responsive regression suite covered 13 pages across 10 viewports: 130 combinations, 0 failures.

## Impeccable detector follow-up

The required manual detector was run once after the pilot UI was complete. It reported 320 advisory or warning instances, led by undersized UI text (95), embedded raster assets (88), low contrast (72), and cramped padding (31). These counts include repeated page-level CSS and should not be interpreted as 320 distinct defects.

One reported broken image is an intentionally empty dynamic image placeholder in `edit.html`; all 18 screenshot renders and all 130 responsive checks completed without a broken visible image. The detector output is preserved at `outputs/brand/impeccable-audit-20260928/LNH_IMPECCABLE_PILOT_DETECTOR_2026-09-29.json` for a future system-level pass.

## Visual finding

The pilot deliberately preserves the current visual identity. Side-by-side captures show no composition, copy, navigation, or hero drift. The visible changes are limited to slightly more usable controls and clearer low-emphasis text. Image optimization produced no material visual degradation at the tested desktop, laptop, and mobile sizes.

## Decision paths

1. **Selective acceptance:** adopt only A, B, or C.
2. **Full pilot acceptance:** adopt A+B+C after CEO review.
3. **Hold:** keep production at `e1f523a`; the pilot remains available for further iteration.

No production application should occur until the chosen scope is approved. A deeper visual-system pass, including token consolidation and CSS override cleanup, should remain a separate experiment because it has a larger visual and regression surface.
