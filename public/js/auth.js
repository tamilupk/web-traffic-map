/**
 * Frontend authentication utilities
 * Manages JWT storage, auth state, and authenticated fetch
 */

const Auth = {
  TOKEN_KEY: 'wtm_jwt',
  USER_KEY: 'wtm_user',

  /** Store JWT and user info after login/register */
  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  /** Get the stored JWT */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /** Get the stored user info */
  getUser() {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  /** Clear session (logout) */
  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  /** Check if user is authenticated (token exists and not expired) */
  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  },

  /** Redirect to login if not authenticated. Returns false if redirecting. */
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  },

  /** Authenticated fetch wrapper — adds Authorization header, handles 401 */
  async fetch(url, options = {}) {
    const token = this.getToken();
    const headers = { ...(options.headers || {}) };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      this.clearSession();
      window.location.href = '/login';
      throw new Error('Session expired');
    }

    return response;
  },

  /** Logout and redirect */
  logout() {
    this.clearSession();
    window.location.href = '/login';
  }
};
