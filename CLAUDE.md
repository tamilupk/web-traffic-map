# Web Traffic Map — development notes

See README.md and TRUENAS-SETUP.md for setup, environment variables and privacy.

- CommonJS Node backend with Hono, SQLite via better-sqlite3, and passkey auth.
- Vanilla JavaScript frontend with Leaflet and CARTO Voyager tiles.
- Source directories: src/api, src/auth, src/db, src/geo, src/ingestion, src/parser.
- Static frontend: public/; CLI invitation and promotion tools: scripts/.
- Log files are proxy-host-*_access.log in LOG_DIR; ingestion tracks byte offsets.
- Authenticated users can read traffic data; administrative actions require admin.
- Run `npm test` and `npm audit --omit=dev` for security-sensitive changes.
- Preserve existing map/filter/modal/live-notification behavior and UI styling.
- Never commit real logs, databases, .env files, invite URLs or API credentials.

## Expected nginx proxy log format

```text
[timestamp] - status upstream_status - METHOD protocol host "path" [Client IP] [Length bytes] [Gzip ratio] [Sent-to backend] "User-Agent" "Referer"
```

The parser extracts timestamps, host, path, method, status, IP, user agent and
related metadata. Geolocation is cached per IP. Threat detection uses local
heuristics unless an optional OpenAI-compatible provider is configured.
