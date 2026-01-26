# Web Traffic Map

A web traffic visualization tool that parses nginx access logs and displays visitor locations on an interactive map.

## Tech Stack

- **Backend:** Node.js
- **Database:** SQLite (via `better-sqlite3`)
- **Deployment:** Docker on TrueNAS Scale
- **Frontend:** Modern UI with interactive map

## Data Source

Nginx proxy access logs from: `nginx-logs/proxy-host-*_access.log`

### Log Format
```
[timestamp] - status upstream_status - METHOD protocol host "path" [Client IP] [Length bytes] [Gzip ratio] [Sent-to backend] "User-Agent" "Referer"
```

### Extractable Fields
- Timestamp (date, time, timezone)
- HTTP Status / Upstream Status
- HTTP Method (GET, POST, etc.)
- Protocol (http/https)
- Host (domain)
- Request Path
- Client IP
- Response Length
- Gzip Ratio
- Backend Server
- User-Agent
- Referer

### Known Hosts
- chat.tamilarasu.dev
- speed.tamilarasu.dev
- immich.tamilarasu.dev
- jellyfin.tamilarasu.dev
- www.tamilarasu.dev

## UI Requirements

### Design Language
- **Style:** Clean, modern Material Design 3 (Material You) aesthetic
- **Colors:** Soft, muted palette with proper elevation and shadows
- **Typography:** Clean sans-serif (Roboto or Inter)
- **Components:** Rounded corners, subtle animations, proper spacing

### Layout
- **Map:** Main area - Google Maps showing visitor locations with markers
- **Sidebar:** Left side - filters and controls with Material 3 styling

### Map (Leaflet + CartoDB)
- **Tiles:** CartoDB Voyager (light) or Positron (minimal) - no API key needed
- **Library:** Leaflet.js
- **Future:** Can swap to Google Maps JavaScript API when ready
- Clean, modern tile style that matches Material 3 aesthetic
- Bubble visualization:
  - Circle size = traffic volume (bigger usage = bigger bubble)
  - Zoom-based aggregation:
    - Zoomed out: Country-level bubbles
    - Zoom in: Split into region/state bubbles
    - Zoom more: Split into city-level bubbles
    - Max zoom: Individual IP locations
  - Smooth transitions when bubbles split/merge
- Info popups showing visitor count and details on click
- Color coding by traffic intensity

### Filters (Left Sidebar)
1. **Domain** - Dropdown/chip selector for host/domain
2. **Device Type** - Chip group (desktop, mobile, tablet, bot)
3. **Date Range** - Material date range picker (default: today)
4. **Country** - Searchable dropdown
5. **Home Page Only** - Material switch/checkbox to show only "/" requests

### UI Framework Options
- Vanilla CSS with Material 3 design tokens
- Or lightweight library like Material Web Components (@material/web)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Container                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ Log Watcher │───▶│   SQLite    │◀───│  REST API   │  │
│  │  (chokidar) │    │  Database   │    │   (Hono)    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                                    │           │
│         ▼                                    ▼           │
│  ┌─────────────┐                       ┌─────────────┐  │
│  │  Ingestion  │                       │  Frontend   │  │
│  │  (incremental)                      │  (Static)   │  │
│  └─────────────┘                       └─────────────┘  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Nginx Logs     │
│  (Volume Mount) │
└─────────────────┘
```

## API Design

### 1. Query API (REST)
Endpoints for frontend to fetch filtered log data:
- `GET /api/logs` - Query logs with filters
- `GET /api/stats` - Aggregated statistics
- `GET /api/countries` - List of countries for filter
- `GET /api/domains` - List of domains for filter

### 2. Ingestion Service
File watcher that monitors log files and ingests only new entries:
- Uses `chokidar` to watch for file changes
- Tracks file position (byte offset) per log file in database
- On change: seeks to last position, reads only new lines
- Parses and inserts new entries efficiently
- Handles log rotation gracefully

```
┌─────────────────────────────────────────────────────┐
│                 Ingestion Flow                       │
│                                                      │
│  File Change ──▶ Get Last Offset ──▶ Read New Lines │
│                        │                    │        │
│                        ▼                    ▼        │
│               file_positions table    Parse & Insert │
│               (file_path, offset)     into logs table│
└─────────────────────────────────────────────────────┘
```

## Code Standards

- **Framework:** Hono (lightweight, fast, modern)
- **Comments:** All functions and modules should have JSDoc comments
- **Modularity:** Separate concerns into distinct modules:
  ```
  src/
  ├── index.js          # Entry point
  ├── config.js         # Configuration
  ├── db/
  │   ├── schema.js     # Database schema
  │   └── queries.js    # Query functions
  ├── parser/
  │   ├── nginx.js      # Log line parser
  │   └── useragent.js  # Device type detection
  ├── ingestion/
  │   ├── watcher.js    # File watcher
  │   └── processor.js  # Log processor
  ├── api/
  │   ├── routes.js     # API routes
  │   └── handlers.js   # Request handlers
  └── geo/
      └── lookup.js     # IP geolocation (ipwhois.app + cache)

## Geolocation

**Solution:** ipwhois.app (free API, no key required)

- Endpoint: `https://ipwhois.app/json/{ip}`
- No API key needed
- Returns: country, region, city, lat/lng, ISP, timezone, country flag
- Rate limit: ~10,000 requests/month free
- Cache results in SQLite to avoid repeated lookups

**Caching Strategy:**
- Store geo data per IP in database
- Only call API for new/unknown IPs
- Significantly reduces API calls (same IP = same location)

## Configuration (Environment Variables)

```env
# Optional (defaults shown)
PORT=3000
DB_PATH=/data/traffic.db
LOG_DIR=/logs

# Future: For Google Maps upgrade
# GOOGLE_MAPS_API_KEY=your_google_maps_key
```
  ```

## Features to Implement

- [ ] Log parser for nginx format
- [ ] SQLite schema for log storage
- [ ] File position tracking for incremental ingestion
- [ ] File watcher with chokidar
- [ ] IP geolocation with ipwhois.app (cached in DB)
- [ ] REST API for querying logs (Hono)
- [ ] Leaflet map with bubble visualization
- [ ] Zoom-based bubble splitting (country → region → city)
- [ ] Material 3 styled filter sidebar
- [ ] Dockerfile for TrueNAS Scale

## Prerequisites

None! All APIs used are free and keyless:
- **Map:** Leaflet + CartoDB tiles (free, no key)
- **Geolocation:** ipwhois.app (free, no key)

**Optional future upgrade:**
- Google Maps API key for premium map features
