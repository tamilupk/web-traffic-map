/**
 * User agent parser module
 * Detects device type from User-Agent strings
 * @module parser/useragent
 */

/**
 * Bot patterns to identify crawler/bot traffic
 */
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /python-urllib/i,
  /java\//i,
  /httpclient/i,
  /okhttp/i,
  /axios/i,
  /node-fetch/i,
  /go-http-client/i,
  /ruby/i,
  /perl/i,
  /libwww/i,
  /apache-httpclient/i,
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /duckduckbot/i,
  /slurp/i,
  /facebookexternalhit/i,
  /linkedinbot/i,
  /twitterbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /slackbot/i,
  /pingdom/i,
  /uptimerobot/i,
  /better\s*stack/i,
  /uptime\s*bot/i,
  /monitoring/i,
  /healthcheck/i,
  /lighthouse/i,
  /pagespeed/i,
  /gtmetrix/i,
  /semrush/i,
  /ahrefs/i,
  /mj12bot/i,
  /dotbot/i,
  /seznambot/i,
  /applebot/i,
  /archive\.org/i,
  /ia_archiver/i
];

/**
 * Mobile device patterns
 */
const MOBILE_PATTERNS = [
  /mobile/i,
  /android(?!.*tablet)/i,
  /iphone/i,
  /ipod/i,
  /blackberry/i,
  /windows phone/i,
  /opera mini/i,
  /opera mobi/i,
  /iemobile/i,
  /mobile safari/i,
  /webos/i,
  /palm/i,
  /symbian/i,
  /nokia/i,
  /samsung/i,
  /lg-/i,
  /htc/i,
  /sony/i,
  /motorola/i,
  /alcatel/i,
  /huawei/i,
  /xiaomi/i,
  /oppo/i,
  /vivo/i,
  /realme/i,
  /oneplus/i,
  /pixel/i
];

/**
 * Tablet device patterns
 */
const TABLET_PATTERNS = [
  /ipad/i,
  /tablet/i,
  /android.*tablet/i,
  /kindle/i,
  /silk/i,
  /playbook/i,
  /nexus\s*(7|9|10)/i,
  /samsung.*tab/i,
  /galaxy\s*tab/i,
  /surface/i,
  /lenovo.*tab/i
];

/**
 * Detect device type from User-Agent string
 * @param {string} userAgent - User-Agent string
 * @returns {string} Device type: 'bot', 'mobile', 'tablet', or 'desktop'
 */
function detectDeviceType(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return 'unknown';
  }

  // Check for bots first (highest priority)
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return 'bot';
    }
  }

  // Check for tablets before mobile (iPad, Android tablet, etc.)
  for (const pattern of TABLET_PATTERNS) {
    if (pattern.test(userAgent)) {
      return 'tablet';
    }
  }

  // Check for mobile devices
  for (const pattern of MOBILE_PATTERNS) {
    if (pattern.test(userAgent)) {
      return 'mobile';
    }
  }

  // Default to desktop
  return 'desktop';
}

/**
 * Extract browser name from User-Agent
 * @param {string} userAgent - User-Agent string
 * @returns {string} Browser name
 */
function detectBrowser(userAgent) {
  if (!userAgent) return 'unknown';

  if (/edg/i.test(userAgent)) return 'Edge';
  if (/opr|opera/i.test(userAgent)) return 'Opera';
  if (/chrome|crios/i.test(userAgent)) return 'Chrome';
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  if (/msie|trident/i.test(userAgent)) return 'IE';

  return 'other';
}

/**
 * Extract OS from User-Agent
 * @param {string} userAgent - User-Agent string
 * @returns {string} Operating system name
 */
function detectOS(userAgent) {
  if (!userAgent) return 'unknown';

  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent) && !/android/i.test(userAgent)) return 'Linux';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/cros/i.test(userAgent)) return 'ChromeOS';

  return 'other';
}

module.exports = {
  detectDeviceType,
  detectBrowser,
  detectOS,
  BOT_PATTERNS,
  MOBILE_PATTERNS,
  TABLET_PATTERNS
};
