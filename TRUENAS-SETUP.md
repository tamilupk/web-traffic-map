# TrueNAS Scale Deployment

## Docker Setup

```bash
docker-compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `30045` | Server port |
| `DB_PATH` | `/data/traffic.db` | SQLite database path |
| `LOG_DIR` | `/logs` | Nginx logs directory |
| `CARTO_BASEMAP_API_KEY` | empty | CARTO tile key, visible in the browser; restrict it to your website in CARTO |
| `RP_ID` | `localhost` | WebAuthn Relying Party ID (your domain, no protocol/port) |
| `RP_NAME` | `Web Traffic Map` | WebAuthn Relying Party display name |
| `WEBAUTHN_ORIGIN` | `http://localhost:3000` | Full origin for WebAuthn (protocol + domain) |
| `JWT_SECRET` | auto-generated | Secret for signing JWTs (auto-generated and persisted in DB if not set) |
| `JWT_EXPIRY` | `7d` | JWT token lifetime |

### Production environment example

```yaml
environment:
  - NODE_ENV=production
  - PORT=30045
  - DB_PATH=/data/traffic.db
  - LOG_DIR=/logs
  - RP_ID=traffic.example.com
  - RP_NAME=Web Traffic Map
  - WEBAUTHN_ORIGIN=https://traffic.example.com
  - CARTO_BASEMAP_API_KEY=${CARTO_BASEMAP_API_KEY}
```

For Docker Compose, set `CARTO_BASEMAP_API_KEY` in a `.env` file next to
`docker-compose.yml` (see `.env.example`). The `.env` file is ignored by Git
and excluded from Docker images. Rebuild/pull the updated app image, then run
`docker compose up -d --force-recreate web-traffic-map` to apply the setting.
For a TrueNAS-managed app, add the variable in the app's environment settings.
For local `npm start`, export the variable in your shell; Node does not load
`.env` automatically. The browser obtains only this key from the authenticated
`/api/map-config` endpoint and requests tiles directly from CARTO.

## Authentication Setup

The app uses passkey (WebAuthn) authentication. Users must be invited by an admin.

### Create an invite

Run from the project root (or inside the Docker container):

```bash
# Local
node scripts/invite.js admin@example.com

# Docker
docker exec web-traffic-map node scripts/invite.js admin@example.com
```

This prints a UUID token and a registration URL:

```
Invite token created successfully!

  Email:   admin@example.com
  Token:   <invite-token>
  Expires: 2026-02-12T00:00:00.000Z

Registration URL:
  https://traffic.example.com/register?token=<invite-token>
```

Share the URL with the user. They will:

1. Open the registration URL
2. Enter a display name
3. Register a passkey (biometrics / hardware key)
4. Get logged in automatically

After that, they can sign in anytime from `/login` using their passkey.

### Invite token details

- Tokens expire after **24 hours**
- Each token can only be used **once**
- Running the invite command for an existing user creates a token to register an **additional passkey**

## Volumes

| Container Path | Purpose | Mode |
|----------------|---------|------|
| `/logs` | Nginx proxy access logs | Read-only |
| `/data` | SQLite database (persisted) | Read-write |

## Health Check

The container health check hits `GET /health` (no auth required).

## First administrator

After registering the first invited user, promote that account:

```bash
docker exec web-traffic-map node scripts/promote-admin.js admin@example.com
```

Sign out and sign in again to refresh the admin claim. Only administrators can
invite users, restart threat analysis, or trigger manual geolocation processing.
Automatic background analysis and geolocation continue for all installations.

## Optional AI analysis

Set `OPEN_AI_API_KEY` and `OPEN_AI_API_MODEL` to enable AI analysis, and optionally
`OPEN_AI_API_URL` for an OpenAI-compatible chat completions endpoint (default:
OpenRouter). Without a key/model the app uses its built-in heuristic detection.
Enabling AI sends IP addresses, domains, request paths, user agents and timestamps
to that provider. Common credential query parameters are redacted, but this is
not exhaustive; consider your logs' contents and provider policies before enabling
it. AI calls time out after 30 seconds and fall back to heuristic analysis.

Public authentication endpoints accept at most 120 requests per socket peer per
minute and 64 KiB bodies. Behind a reverse proxy the peer may be shared; configure
additional per-client limits at the proxy if needed.
