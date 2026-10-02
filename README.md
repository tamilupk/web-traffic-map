# Web Traffic Map

A self-hosted dashboard for nginx proxy access logs, with a Leaflet visitor map,
filters, live traffic notifications, and heuristic or optional AI threat analysis.
Login uses invite-based passkeys; traffic APIs require authentication.

## Docker / TrueNAS Scale

Use `tamilupk/web-traffic-map:latest` (Linux amd64), expose port **30045**, mount
your nginx logs read-only at `/logs`, and persist `/data` for the SQLite database,
users, passkeys, and generated JWT secret. Set `RP_ID` to your hostname and
`WEBAUTHN_ORIGIN` to its full HTTPS origin. Set `CARTO_BASEMAP_API_KEY` to a
CARTO key restricted to your website. It is intentionally visible in the browser.

For Docker Compose:

```bash
cp .env.example .env
# Set the hostname, origin and map key in .env; provide nginx-logs/.
docker compose up -d
docker exec web-traffic-map node scripts/invite.js admin@example.com
# Open the printed invite URL and register a passkey, then:
docker exec web-traffic-map node scripts/promote-admin.js admin@example.com
```

Sign out and sign in again after promotion. Admins can invite users, trigger a
full threat rescan, and run manual geolocation processing. Everyone signed in can
view the map and threat timeline; automatic workers continue independently.
See [TrueNAS setup](TRUENAS-SETUP.md) for details.

## Local development

Use Node **22.12 or newer** (Docker uses Node 24).

```bash
npm ci
# Export settings from .env in your shell, or use Node's built-in env loader:
node --env-file=.env src/index.js
```

Set `PORT=30045` to match the example origin, or use origin `http://localhost:3000`
with the default local port. `npm start` reads exported environment variables; it
does not automatically load .env. Place logs named `proxy-host-*_access.log` in
`nginx-logs/`, or override `LOG_DIR`. This parser expects the custom nginx proxy
log format documented in [CLAUDE.md](CLAUDE.md).

## Configuration and privacy

[.env.example](.env.example) documents map, auth, storage and optional AI settings.
Geolocation sends public visitor IPs to ipwhois.app. CARTO receives tile requests
from visitors' browsers. If `OPEN_AI_API_KEY` and `OPEN_AI_API_MODEL` are set,
request metadata is sent to your configured AI provider. Common token/password
query values are redacted first; this is not exhaustive. Without those settings,
threat detection uses local heuristics. Never publish real logs, databases,
.env files, invite links or private API keys. Preserve map attribution.

## Validation

```bash
npm test
npm audit --omit=dev
docker build --pull --platform linux/amd64 -t web-traffic-map:test .
```

Tests cover authentication boundaries, passkey ceremonies, escaping, redaction,
challenge expiration and rate limits. Production proxy rate limits supplement
the app's shared per-peer authentication budget.

## License

[ISC](LICENSE).
