# Publication review — October 1, 2026

The initial review scanned 25 local commits and identified a historical Google
API key, unescaped threat data, missing passkey challenge binding, and publication
cleanup items. No credential values appear in this report.

## Implemented

- Escaped untrusted threat, map, log, notification and invite fields. Map popup
  actions now use event listeners instead of embedding JSON in inline handlers.
- Bound registration challenges to the invited user and registration ceremony;
  login only accepts authentication challenges. Fixed ISO challenge cleanup.
- Added bounded authentication request budgets and a 64 KiB request limit.
- Made rescan/manual geolocation admin-only while preserving automatic workers
  and authenticated read access.
- Redacted common credentials in optional AI requests and added a 30-second
  timeout with existing heuristic fallback. Original local logs remain intact.
- Expanded ignore rules, removed tracked test output, documented environment
  variables/privacy/setup, and added the existing declared ISC license.
- Added regression tests covering passkey ceremonies and replay protection,
  authentication boundaries, rendering, redaction, expiration and rate limits.

## Publication handling

The history uploaded to GitHub is sanitized separately from the original local
backup. Scan it for credentials before pushing. Never upload a backup bundle or
ignored .env, data, nginx logs or local tool settings.

The previously exposed Google key still needs revocation at its provider if that
has not already been done; removing Git history does not revoke credentials.
The CARTO key remains browser-visible by design and must stay domain-restricted.

## Limits

Credential redaction is not exhaustive. AI receives IPs and other request
metadata when explicitly configured. Authentication budgets are process-local
and based on the socket peer; reverse proxies should add per-client limits.
This review is targeted and does not guarantee absence of every security issue.
