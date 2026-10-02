/** Bound public ceremonies using the socket peer, never untrusted forwarded headers.
 * A reverse proxy shares a generous budget and can add per-client limits upstream.
 */
function createAuthRateLimiter({ windowMs = 60000, limit = 120, maxPeers = 10000, now = Date.now } = {}) {
  const peers = new Map();
  return async (c, next) => {
    const time = now();
    const peer = c.env?.incoming?.socket?.remoteAddress || 'unknown';
    let entry = peers.get(peer);
    if (!entry || entry.expires <= time) {
      for (const [key, value] of peers) {
        if (value.expires <= time) peers.delete(key);
      }
      if (!peers.has(peer) && peers.size >= maxPeers) {
        c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
        return c.json({ success: false, error: 'Too many authentication requests. Try again shortly.' }, 429);
      }
      entry = { count: 0, expires: time + windowMs };
      peers.set(peer, entry);
    }
    if (++entry.count > limit) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((entry.expires - time) / 1000))));
      return c.json({ success: false, error: 'Too many authentication requests. Try again shortly.' }, 429);
    }
    return next();
  };
}

module.exports = { createAuthRateLimiter };
