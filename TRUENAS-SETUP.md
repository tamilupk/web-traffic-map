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
```

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
