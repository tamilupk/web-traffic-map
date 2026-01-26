/**
 * Web Traffic Map - Map Module
 * Handles Leaflet map initialization and bubble visualization
 */

// Map instance
let map = null;
let markersLayer = null;

// Aggregation level thresholds
const ZOOM_LEVELS = {
  country: { min: 0, max: 4 },
  region: { min: 5, max: 7 },
  city: { min: 8, max: 11 },
  ip: { min: 12, max: 20 }
};

// Bubble size range
const BUBBLE_SIZE = {
  min: 20,
  max: 80
};

// Color gradient based on traffic intensity
const BUBBLE_COLORS = [
  { threshold: 0, color: '#60A5FA' },      // Blue - low
  { threshold: 50, color: '#34D399' },     // Green
  { threshold: 100, color: '#FBBF24' },    // Yellow
  { threshold: 500, color: '#F97316' },    // Orange
  { threshold: 1000, color: '#EF4444' }    // Red - high
];

/**
 * Initialize the Leaflet map
 */
function initMap() {
  // Create map centered on world view
  map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: true,
    scrollWheelZoom: true
  });

  // Add CartoDB Voyager tiles (clean, modern style)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Create markers layer group
  markersLayer = L.layerGroup().addTo(map);

  // Handle zoom changes
  map.on('zoomend', handleZoomChange);
  map.on('moveend', debounce(handleMoveEnd, 300));

  // Initial zoom level display
  updateZoomIndicator(map.getZoom());
}

/**
 * Handle zoom level changes
 */
function handleZoomChange() {
  const zoom = map.getZoom();
  updateZoomIndicator(zoom);
}

/**
 * Handle map move end (pan or zoom)
 */
function handleMoveEnd() {
  // Reload locations with appropriate aggregation level
  loadLocations();
}

/**
 * Get aggregation level based on zoom
 * @param {number} zoom - Current zoom level
 * @returns {string} Aggregation level
 */
function getAggregationLevel(zoom) {
  if (zoom <= ZOOM_LEVELS.country.max) return 'country';
  if (zoom <= ZOOM_LEVELS.region.max) return 'region';
  if (zoom <= ZOOM_LEVELS.city.max) return 'city';
  return 'ip';
}

/**
 * Update zoom level indicator
 * @param {number} zoom - Current zoom level
 */
function updateZoomIndicator(zoom) {
  const level = getAggregationLevel(zoom);
  const levelNames = {
    country: 'Country',
    region: 'Region',
    city: 'City',
    ip: 'Individual'
  };

  document.getElementById('zoom-level').textContent = levelNames[level];
}

/**
 * Calculate bubble size based on request count
 * @param {number} count - Request count
 * @param {number} maxCount - Maximum count in dataset
 * @returns {number} Bubble diameter in pixels
 */
function calculateBubbleSize(count, maxCount) {
  if (maxCount === 0) return BUBBLE_SIZE.min;

  // Use sqrt scale for better visualization
  const scale = Math.sqrt(count) / Math.sqrt(maxCount);
  return BUBBLE_SIZE.min + scale * (BUBBLE_SIZE.max - BUBBLE_SIZE.min);
}

/**
 * Get bubble color based on request count
 * @param {number} count - Request count
 * @returns {string} Hex color
 */
function getBubbleColor(count) {
  let color = BUBBLE_COLORS[0].color;

  for (const level of BUBBLE_COLORS) {
    if (count >= level.threshold) {
      color = level.color;
    }
  }

  return color;
}

/**
 * Create a bubble marker
 * @param {Object} location - Location data
 * @param {number} size - Bubble size
 * @param {string} color - Bubble color
 * @returns {L.Marker} Leaflet marker
 */
function createBubbleMarker(location, size, color) {
  // Create custom div icon
  const icon = L.divIcon({
    className: 'bubble-marker-container',
    html: `<div class="bubble-marker" style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      opacity: 0.85;
    ">${size > 30 ? formatCompactNumber(location.request_count) : ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });

  const marker = L.marker([location.latitude, location.longitude], { icon });

  // Add popup with details
  const popupContent = createPopupContent(location);
  marker.bindPopup(popupContent, {
    maxWidth: 250,
    className: 'custom-popup'
  });

  return marker;
}

/**
 * Create popup content HTML
 * @param {Object} location - Location data
 * @returns {string} HTML content
 */
function createPopupContent(location) {
  let title = '';
  let details = '';

  if (location.city) {
    title = `${location.country_flag || ''} ${location.city}`;
    details = `<div class="popup-stat">
      <span class="popup-stat-label">Region</span>
      <span class="popup-stat-value">${location.region || '-'}</span>
    </div>
    <div class="popup-stat">
      <span class="popup-stat-label">Country</span>
      <span class="popup-stat-value">${location.country || '-'}</span>
    </div>`;
  } else if (location.region) {
    title = `${location.country_flag || ''} ${location.region}`;
    details = `<div class="popup-stat">
      <span class="popup-stat-label">Country</span>
      <span class="popup-stat-value">${location.country || '-'}</span>
    </div>`;
  } else if (location.country) {
    title = `${location.country_flag || ''} ${location.country}`;
  } else if (location.client_ip) {
    title = location.client_ip;
    details = `<div class="popup-stat">
      <span class="popup-stat-label">Location</span>
      <span class="popup-stat-value">${location.city || ''} ${location.region || ''} ${location.country || ''}</span>
    </div>`;
  }

  // Add "Show Data" button
  const showDataButton = `<button class="popup-show-data-btn" onclick="showLocationData(${JSON.stringify(location).replace(/"/g, '&quot;')})">
        Show Data
       </button>`;

  return `<div class="popup-content">
    <div class="popup-title">${title}</div>
    <div class="popup-stat">
      <span class="popup-stat-label">Requests</span>
      <span class="popup-stat-value">${formatNumber(location.request_count)}</span>
    </div>
    <div class="popup-stat">
      <span class="popup-stat-label">Unique IPs</span>
      <span class="popup-stat-value">${formatNumber(location.unique_ips)}</span>
    </div>
    ${details}
    ${showDataButton}
  </div>`;
}

/**
 * Device type icons (SVG)
 */
const DEVICE_ICONS = {
  desktop: '<svg class="device-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>',
  mobile: '<svg class="device-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>',
  tablet: '<svg class="device-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 0h-14A2.5 2.5 0 0 0 2 2.5v19A2.5 2.5 0 0 0 4.5 24h14a2.5 2.5 0 0 0 2.5-2.5v-19A2.5 2.5 0 0 0 18.5 0zm-7 23c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm7.5-4H4V3h15v16z"/></svg>',
  bot: '<svg class="device-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/></svg>',
  unknown: '<svg class="device-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>'
};

/**
 * Get device icon HTML
 * @param {string} deviceType - Device type
 * @returns {string} SVG icon HTML
 */
function getDeviceIcon(deviceType) {
  return DEVICE_ICONS[deviceType] || DEVICE_ICONS.unknown;
}

/**
 * Group logs by domain, status, method, device, IP
 * @param {Array} logs - Array of log entries
 * @returns {Array} Grouped log entries
 */
function groupLogs(logs) {
  const groups = {};

  logs.forEach(log => {
    const key = `${log.host}|${log.status}|${log.method}|${log.device_type}|${log.client_ip}`;
    if (!groups[key]) {
      groups[key] = {
        host: log.host,
        status: log.status,
        method: log.method,
        device_type: log.device_type,
        client_ip: log.client_ip,
        isp: log.isp || '-',
        paths: [],
        count: 0
      };
    }
    groups[key].paths.push({
      path: log.path,
      timestamp: log.timestamp
    });
    groups[key].count++;
  });

  return Object.values(groups).sort((a, b) => b.count - a.count);
}

/**
 * Show detailed data for a location in modal
 * @param {Object} location - Location data
 */
async function showLocationData(location) {
  // Close any open popup
  map.closePopup();

  // Build filter params based on location
  const params = { ...AppState.filters };

  if (location.client_ip) {
    params.ip = location.client_ip;
  } else if (location.city) {
    params.city = location.city;
  } else if (location.region) {
    params.region = location.region;
  } else if (location.country_code) {
    params.country = location.country_code;
  }

  // Set modal title
  const title = location.city || location.region || location.country || location.client_ip || 'Unknown Location';
  document.getElementById('modal-title').textContent = `${location.country_flag || ''} ${title} - Request Details`;

  // Show modal with loading state
  const modal = document.getElementById('data-modal');
  const tableBody = document.getElementById('modal-table-body');
  tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading...</td></tr>';
  modal.classList.add('active');

  try {
    // Fetch detailed logs for this location
    const result = await fetchAPI('logs', { ...params, limit: 1000 });

    if (result.success && result.data.length > 0) {
      const groupedLogs = groupLogs(result.data);

      tableBody.innerHTML = groupedLogs.map((group, index) => {
        const pathRows = group.paths.map(p => `
          <tr class="path-row" data-group="${index}">
            <td></td>
            <td colspan="6" class="path-cell-expanded">
              <span class="path-time">${formatDateTime(p.timestamp)}</span>
              <span class="path-text">${escapeHtml(p.path)}</span>
            </td>
            <td></td>
          </tr>
        `).join('');

        return `
          <tr class="group-row" data-group="${index}" onclick="togglePathRows(${index})">
            <td class="expand-cell"><span class="expand-icon">▶</span></td>
            <td class="domain-cell">${escapeHtml(group.host)}</td>
            <td><span class="status-badge status-${getStatusClass(group.status)}">${group.status}</span></td>
            <td><span class="method-badge">${group.method}</span></td>
            <td class="device-cell" title="${group.device_type}">${getDeviceIcon(group.device_type)}</td>
            <td class="ip-cell">${group.client_ip}</td>
            <td class="isp-cell" title="${escapeHtml(group.isp)}">${escapeHtml(truncateText(group.isp, 20))}</td>
            <td class="count-cell">${group.count}</td>
          </tr>
          ${pathRows}
        `;
      }).join('');
    } else {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">No data found</td></tr>';
    }
  } catch (error) {
    console.error('Error fetching location data:', error);
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #ef4444;">Error loading data</td></tr>';
  }
}

/**
 * Toggle visibility of path rows for a group
 * @param {number} groupIndex - Group index
 */
function togglePathRows(groupIndex) {
  const groupRow = document.querySelector(`.group-row[data-group="${groupIndex}"]`);
  const pathRows = document.querySelectorAll(`.path-row[data-group="${groupIndex}"]`);
  const expandIcon = groupRow.querySelector('.expand-icon');

  const isExpanded = groupRow.classList.contains('expanded');

  if (isExpanded) {
    groupRow.classList.remove('expanded');
    expandIcon.textContent = '▶';
    pathRows.forEach(row => row.classList.remove('visible'));
  } else {
    groupRow.classList.add('expanded');
    expandIcon.textContent = '▼';
    pathRows.forEach(row => row.classList.add('visible'));
  }
}

/**
 * Format timestamp to readable date/time
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted date/time
 */
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get status class for badge styling
 * @param {number} status - HTTP status code
 * @returns {string} CSS class suffix
 */
function getStatusClass(status) {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500) return 'server-error';
  return 'unknown';
}

/**
 * Truncate path for display
 * @param {string} path - Request path
 * @returns {string} Truncated path
 */
function truncatePath(path) {
  if (!path) return '-';
  return path.length > 40 ? path.substring(0, 37) + '...' : path;
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text) return '-';
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update map markers with new location data
 * @param {Array<Object>} locations - Location data array
 */
function updateMapMarkers(locations) {
  // Clear existing markers
  markersLayer.clearLayers();

  if (!locations || locations.length === 0) {
    return;
  }

  // Find max count for scaling
  const maxCount = Math.max(...locations.map(l => l.request_count));

  // Create markers
  locations.forEach(location => {
    if (!location.latitude || !location.longitude) return;

    const size = calculateBubbleSize(location.request_count, maxCount);
    const color = getBubbleColor(location.request_count);
    const marker = createBubbleMarker(location, size, color);

    markersLayer.addLayer(marker);
  });

  // Fit map to markers if we have data
  if (markersLayer.getLayers().length > 0) {
    // Don't auto-fit on every update, only on initial load or filter change
    // map.fitBounds(markersLayer.getBounds(), { padding: [50, 50] });
  }
}

/**
 * Format number in compact form (1.2K, 3.4M)
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatCompactNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Fly to a specific location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} zoom - Zoom level
 */
function flyToLocation(lat, lng, zoom = 8) {
  map.flyTo([lat, lng], zoom, {
    duration: 1.5
  });
}

/**
 * Reset map view to world
 */
function resetMapView() {
  map.flyTo([20, 0], 3, {
    duration: 1
  });
}
