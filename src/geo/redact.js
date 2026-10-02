/** Keep attack patterns useful while removing common credentials from AI input. */
function redactSecrets(value) {
  if (typeof value === 'string') {
    return value
      .replace(/([?&](?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|key|password|passwd|secret|authorization|auth|session[_-]?id|session|jwt|signature|sig|code)=)[^&#\s]*/gi, '$1[REDACTED]')
      .replace(/\bBearer\s+[\w.+\/-]+/gi, 'Bearer [REDACTED]')
      .replace(/\bAIza[\w-]{35}\b/g, '[REDACTED]')
      .replace(/\bsk-(?:or-v1-)?[\w-]{20,}\b/g, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSecrets(item)]));
  }
  return value;
}

module.exports = { redactSecrets };
