# WEB OS Admin Analytics Staging Report

Date: 2026-11-12  
Scope: LNH admin analytics only  
Status: intelligence command center implemented locally; production held for D1 migration and secret configuration

## Implemented

- Added today's KST (`Asia/Seoul`, UTC+09:00) totals and 00-23 hourly flow.
- Added a 30-calendar-day daily table including today.
- Separated `visit_sessions` from `page_views`.
- Assigned each session once per KST date to the hour of its first `page_view`.
- Counted every `page_view` at its occurrence time.
- Filled hours and dates without events with zero values.
- Marked the current KST hour and current day as provisional.
- Added the server reference time and KST 00:00 aggregation boundary to the admin UI.
- Kept raw session IDs and PII out of the admin API response.
- Left public copy, layout, tracking events, and PII collection unchanged.
- Added a composite analytics index migration for `event_name, created_at`.
- Added today, 7-day, 30-day, quarter, and 1-year period controls with previous-period comparison.
- Added region/country and ASN organization aggregation from Cloudflare request metadata.
- Added an HMAC-SHA256 visitor fingerprint for rate-pattern detection; raw IP addresses are not stored or returned.
- Added explainable automation-risk scoring for Cloudflare bot signals, automation user agents, event velocity, and session churn.
- Attached the same privacy-preserving region/ASN/risk summary to new application records so operators can prioritize manual review without seeing raw IP addresses.
- Added a live traffic chart, region distribution, risk observatory, and deterministic machine-readout summaries.
- Kept applicant operations in the same admin surface below the intelligence command center.
- Updated the privacy policy to describe region/ASN, HMAC network identifiers, and non-definitive risk signals.

## Verification

- `python3 -m unittest discover -s tests -p 'test_*.py'`: passed.
- JavaScript runtime checks: KST rollover, 24 zero-filled hours, 30-day range, unauthorized 401, authorized 200, HMAC stability, no raw IP/session/visitor identifiers in the admin response: passed.
- Admin JavaScript syntax and required admin element checks: passed.
- Desktop and 390px mobile visual QA: no page-level horizontal overflow; chart, period controls, region, risk, and applicant operations render in sequence.
- `git diff --check`: passed.

No production analytics counts were read or reported during verification.

## Evidence

- API: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/functions/api/admin/analytics.js`
- KST helper: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/functions/_lib/analytics-timeline.js`
- Admin UI: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/public/admin/index.html`
- Admin rendering: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/public/assets/admin.js`
- Admin styles: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/public/assets/application-system.css`
- Migration: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/migrations/0005_analytics_event_created_index.sql`
- Intelligence migration: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/migrations/0006_analytics_intelligence.sql`
- Privacy-preserving risk logic: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/functions/_lib/analytics-risk.js`
- Tests: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/tests/admin-analytics.test.mjs`
- SQL fixture tests: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/tests/test_admin_analytics_sql.py`
- Migration test: `/Users/lnh/Documents/LNH OS/experiments/impeccable-web-pilot-20260929/tests/test_analytics_intelligence_migration.py`

## Production Steps (Held)

1. Apply pending D1 migrations `0005` and `0006` before deploying code that writes the new columns.
2. Configure a strong production `ANALYTICS_HASH_KEY` as a Cloudflare Pages secret. Do not reuse an admin password or API token.
3. Deploy the reviewed commit only after steps 1-2 succeed.
4. Sign in through the production admin authentication layer and confirm desktop/mobile layouts and period controls.
5. Confirm the sum of 24 hourly session counts equals today's session total and that no response exposes `session_id`, `visitor_key`, raw IP, or applicant data.
6. Observe risk scores for at least one week before adding Cloudflare Managed Challenge or rate-limit rules; do not auto-block solely from this score.
7. Obtain CEO/Legal confirmation for the revised privacy wording and retention policy before treating the intelligence layer as final production policy.

Production deployment remains intentionally blocked pending explicit approval.
