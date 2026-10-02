/** Escape untrusted values for HTML text and quoted attributes. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

/** Only allow invite links to this application. */
function safeInviteUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/register'
      ? url.href : '#';
  } catch {
    return '#';
  }
}
