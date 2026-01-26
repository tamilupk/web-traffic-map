/**
 * Web Traffic Map - Filters Module
 * Handles filter UI interactions and state management
 */



/**
 * Initialize filter event listeners
 * All filters are dynamic - they apply immediately on change
 */
function initFilters() {
  // Domain filter - apply immediately
  document.getElementById('filter-domain').addEventListener('change', (e) => {
    AppState.filters.host = e.target.value;
    applyFilters();
  });

  // Device type chips - apply immediately
  document.querySelectorAll('#device-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      // Remove active from all chips
      document.querySelectorAll('#device-chips .chip').forEach(c => {
        c.classList.remove('active');
      });
      // Add active to clicked chip
      chip.classList.add('active');
      AppState.filters.device_type = chip.dataset.value;
      applyFilters();
    });
  });

  // Date range filters - apply immediately
  document.getElementById('filter-start-date').addEventListener('change', (e) => {
    AppState.filters.start_date = e.target.value;
    if (validateDateRange()) {
      applyFilters();
    }
  });

  document.getElementById('filter-end-date').addEventListener('change', (e) => {
    AppState.filters.end_date = e.target.value;
    if (validateDateRange()) {
      applyFilters();
    }
  });



  // Country filter - apply immediately
  document.getElementById('filter-country').addEventListener('change', (e) => {
    AppState.filters.country = e.target.value;
    applyFilters();
  });

  // Home page only toggle - apply immediately
  document.getElementById('filter-home-only').addEventListener('change', (e) => {
    AppState.filters.home_only = e.target.checked;
    applyFilters();
  });

  // Reset filters button
  document.getElementById('reset-filters').addEventListener('click', () => {
    resetFilters();
  });

  // Quick date range buttons (could add later)
  setupQuickDateFilters();
}

/**
 * Setup quick date filter shortcuts
 */
function setupQuickDateFilters() {
  // This could be expanded to add "Today", "Last 7 days", etc. buttons
  // For now, we'll just set today as default
}

/**
 * Get filter values from UI
 * @returns {Object} Current filter values
 */
function getFilterValues() {
  return {
    host: document.getElementById('filter-domain').value,
    device_type: document.querySelector('#device-chips .chip.active')?.dataset.value || '',
    start_date: document.getElementById('filter-start-date').value,
    end_date: document.getElementById('filter-end-date').value,
    country: document.getElementById('filter-country').value,
    home_only: document.getElementById('filter-home-only').checked
  };
}

/**
 * Set filter values in UI
 * @param {Object} filters - Filter values to set
 */
function setFilterValues(filters) {
  document.getElementById('filter-domain').value = filters.host || '';

  // Set device type chip
  document.querySelectorAll('#device-chips .chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.value === (filters.device_type || ''));
  });

  document.getElementById('filter-start-date').value = filters.start_date || '';
  document.getElementById('filter-end-date').value = filters.end_date || '';
  document.getElementById('filter-country').value = filters.country || '';
  document.getElementById('filter-home-only').checked = filters.home_only || false;
}

/**
 * Validate date range
 * @returns {boolean} True if valid
 */
function validateDateRange() {
  const startDate = document.getElementById('filter-start-date').value;
  const endDate = document.getElementById('filter-end-date').value;

  if (startDate && endDate) {
    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date cannot be after end date');
      return false;
    }
  }

  return true;
}

/**
 * Build query string from filters
 * @param {Object} filters - Filter object
 * @returns {string} Query string
 */
function buildQueryString(filters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined && value !== false) {
      params.append(key, value);
    }
  });

  return params.toString();
}

/**
 * Parse query string to filters
 * @param {string} queryString - URL query string
 * @returns {Object} Filter object
 */
function parseQueryString(queryString) {
  const params = new URLSearchParams(queryString);
  return {
    host: params.get('host') || '',
    device_type: params.get('device_type') || '',
    start_date: params.get('start_date') || '',
    end_date: params.get('end_date') || '',
    ip: params.get('ip') || '',
    country: params.get('country') || '',
    home_only: params.get('home_only') === 'true'
  };
}

/**
 * Save filters to URL
 */
function saveFiltersToUrl() {
  const queryString = buildQueryString(AppState.filters);
  const newUrl = queryString ? `?${queryString}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}

/**
 * Load filters from URL
 */
function loadFiltersFromUrl() {
  const filters = parseQueryString(window.location.search);
  AppState.filters = { ...AppState.filters, ...filters };
  setFilterValues(AppState.filters);
}
