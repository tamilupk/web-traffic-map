/**
 * Web Traffic Map - Main Application
 * Initializes the app and coordinates between components
 */

// Global state
const AppState = {
  filters: {
    host: '',
    device_type: '',
    start_date: '',
    end_date: '',
    ip: '',
    country: '',
    home_only: false
  },
  stats: null,
  locations: [],
  domains: [],
  countries: []
};

/**
 * Initialize the application
 */
async function initApp() {
  console.log('Initializing Web Traffic Map...');

  // Set default date range (today in local timezone)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('filter-start-date').value = today;
  document.getElementById('filter-end-date').value = today;
  AppState.filters.start_date = today;
  AppState.filters.end_date = today;

  // Initialize map
  initMap();

  // Initialize filters
  initFilters();

  // Initialize modal
  initModal();

  // Initialize mobile sidebar
  initMobileSidebar();

  // Initialize refresh button
  document.getElementById('refresh-data').addEventListener('click', () => {
    applyFilters();
  });

  // Load initial data
  showLoading(true);

  try {
    await Promise.all([
      loadDomains(),
      loadCountries(),
      loadStats(),
      loadLocations()
    ]);
  } catch (error) {
    console.error('Error loading initial data:', error);
  }

  showLoading(false);
}

/**
 * Initialize modal event listeners
 */
function initModal() {
  const modal = document.getElementById('data-modal');
  const closeBtn = document.getElementById('modal-close');

  // Close on X button
  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
}

/**
 * Initialize mobile sidebar interactions
 */
function initMobileSidebar() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const app = document.querySelector('.app');

  if (!toggleBtn || !sidebar || !app) return;

  function setSidebarState(isOpen) {
    sidebar.classList.toggle('active', isOpen);
    app.classList.toggle('sidebar-open', isOpen);
  }

  toggleBtn.addEventListener('click', () => {
    const isActive = sidebar.classList.contains('active');
    setSidebarState(!isActive);
  });

  // Close sidebar on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('active')) {
      setSidebarState(false);
    }
  });

  // Close sidebar when clicking outside (on the map)
  const mapContainer = document.getElementById('map');
  if (mapContainer) {
    mapContainer.addEventListener('click', () => {
      if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
        setSidebarState(false);
      }
    });
  }
}

/**
 * Fetch data from API
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} API response data
 */
async function fetchAPI(endpoint, params = {}) {
  const url = new URL(`/api/${endpoint}`, window.location.origin);

  // Add non-empty params to URL
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      url.searchParams.append(key, value);
    }
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Load available domains for filter
 */
async function loadDomains() {
  try {
    const result = await fetchAPI('domains');
    if (result.success) {
      AppState.domains = result.data;
      populateDomainFilter(result.data);
    }
  } catch (error) {
    console.error('Error loading domains:', error);
  }
}

/**
 * Load available countries for filter
 */
async function loadCountries() {
  try {
    const result = await fetchAPI('countries');
    if (result.success) {
      AppState.countries = result.data;
      populateCountryFilter(result.data);
    }
  } catch (error) {
    console.error('Error loading countries:', error);
  }
}

/**
 * Load statistics
 */
async function loadStats() {
  try {
    const result = await fetchAPI('stats', AppState.filters);
    if (result.success) {
      AppState.stats = result.data;
      updateStatsDisplay(result.data);
      updateTopCountries(result.data.byCountry);
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Load location data for map
 */
async function loadLocations() {
  const zoom = map ? map.getZoom() : 3;
  const level = getAggregationLevel(zoom);

  try {
    const result = await fetchAPI('locations', {
      ...AppState.filters,
      level
    });

    if (result.success) {
      AppState.locations = result.data;
      updateMapMarkers(result.data);
    }
  } catch (error) {
    console.error('Error loading locations:', error);
  }
}

/**
 * Populate domain filter dropdown
 * @param {Array<string>} domains - List of domains
 */
function populateDomainFilter(domains) {
  const select = document.getElementById('filter-domain');
  select.innerHTML = '<option value="">All Domains</option>';

  domains.forEach(domain => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    select.appendChild(option);
  });
}

/**
 * Populate country filter dropdown
 * @param {Array<Object>} countries - List of countries
 */
function populateCountryFilter(countries) {
  const select = document.getElementById('filter-country');
  select.innerHTML = '<option value="">All Countries</option>';

  countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.country_code;
    option.textContent = `${country.country_flag || ''} ${country.country}`;
    select.appendChild(option);
  });
}

/**
 * Update stats display
 * @param {Object} stats - Statistics data
 */
function updateStatsDisplay(stats) {
  document.getElementById('stat-total').textContent = formatNumber(stats.total);
  document.getElementById('stat-unique').textContent = formatNumber(stats.unique_ips);
}

/**
 * Update top countries list
 * @param {Array<Object>} countries - Country statistics
 */
function updateTopCountries(countries) {
  const list = document.getElementById('country-list');
  list.innerHTML = '';

  if (!countries || countries.length === 0) {
    list.innerHTML = '<li class="country-item">No data available</li>';
    return;
  }

  countries.slice(0, 10).forEach(country => {
    if (!country.country) return;

    const li = document.createElement('li');
    li.className = 'country-item';
    li.innerHTML = `
      <span class="country-flag">${country.country_flag || ''}</span>
      <span class="country-name">${country.country}</span>
      <span class="country-count">${formatNumber(country.count)}</span>
    `;
    list.appendChild(li);
  });
}

/**
 * Apply current filters and reload data
 */
async function applyFilters() {
  showLoading(true);

  try {
    await Promise.all([
      loadStats(),
      loadLocations()
    ]);
  } catch (error) {
    console.error('Error applying filters:', error);
  }

  showLoading(false);
}

/**
 * Reset all filters to defaults
 */
function resetFilters() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  AppState.filters = {
    host: '',
    device_type: '',
    start_date: today,
    end_date: today,
    ip: '',
    country: '',
    home_only: false
  };

  // Reset form elements
  document.getElementById('filter-domain').value = '';
  document.getElementById('filter-start-date').value = today;
  document.getElementById('filter-end-date').value = today;
  document.getElementById('filter-country').value = '';
  document.getElementById('filter-home-only').checked = false;

  // Reset device chips
  document.querySelectorAll('#device-chips .chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.value === '');
  });

  applyFilters();
}

/**
 * Show/hide loading overlay
 * @param {boolean} show - Whether to show loading
 */
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.toggle('active', show);
}

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '--';
  return num.toLocaleString();
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
