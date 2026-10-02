const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { Hono } = require('hono');
const { encodeCBOR } = require('@levischuck/tiny-cbor');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-test-'));
process.env.DB_PATH = path.join(temp, 'traffic.db');
process.env.LOG_DIR = temp;
process.env.JWT_SECRET = 'test-only';
process.env.CARTO_BASEMAP_API_KEY = 'test-map-key';
process.env.RP_ID = 'localhost';
process.env.WEBAUTHN_ORIGIN = 'http://localhost:30045';
const { initDatabase, closeDatabase } = require('../src/db/schema');
const q = require('../src/db/queries');
const { createApp } = require('../src/index');
const { createToken, verifyToken } = require('../src/auth/jwt');
const { createAuthRateLimiter } = require('../src/auth/rate-limit');
const { redactSecrets } = require('../src/geo/redact');
const app = createApp();
const b64 = value => Buffer.from(value).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest();
const post = (url, body, headers = {}) => app.request(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
});
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function register(email) {
  const invite = crypto.randomUUID();
  q.createInviteToken(email, invite, new Date(Date.now() + 60000).toISOString());
  const optionsResponse = await post('/api/auth/register/options', { token: invite, displayName: 'Test User' });
  assert.equal(optionsResponse.status, 200);
  const { options } = await optionsResponse.json();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const publicCose = encodeCBOR(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  const id = crypto.randomBytes(32);
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: process.env.WEBAUTHN_ORIGIN, crossOrigin: false }));
  const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
  const authData = Buffer.concat([hash('localhost'), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, id, Buffer.from(publicCose)]);
  const attestation = encodeCBOR(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  const response = await post('/api/auth/register/verify', {
    token: invite, challenge: options.challenge,
    credential: { id: b64(id), rawId: b64(id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(clientData), attestationObject: b64(attestation), transports: ['internal'] } }
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const data = await response.json();
  assert.equal((await verifyToken(data.token)).email, email);
  assert.equal(q.getInviteToken(invite).used, 1);
  return { id, privateKey, userHandle: options.user.id, user: q.getUserByEmail(email), token: data.token };
}

function domFor(file) {
  const dom = new JSDOM(read(file), { url: process.env.WEBAUTHN_ORIGIN, runScripts: 'outside-only' });
  run(dom, read('public/js/security.js'));
  return dom;
}
function run(dom, source) { return vm.runInContext(source, dom.getInternalVMContext()); }
function inlineScript(html, marker) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(script => script.includes(marker));
}

test('security and existing traffic workflows', async t => {
  t.after(() => { closeDatabase(); fs.rmSync(temp, { recursive: true, force: true }); });
  const db = initDatabase();
  await t.test('fresh database and static pages', async () => {
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    for (const route of ['/', '/login', '/register', '/admin', '/threat-analysis', '/js/security.js', '/health']) {
      assert.equal((await app.request(route)).status, 200, route);
    }
    q.setGeoCache('203.0.113.1', { country: 'Test', country_code: 'TT', region: 'Test', city: 'Test', latitude: 1, longitude: 2, isp: 'Test', timezone: 'UTC', country_flag: '' });
    assert.equal(q.getGeoCache('203.0.113.1').longitude, 2);
  });
  let account;
  await t.test('real cryptographic passkey registration, login and replay rejection', async () => {
    account = await register('user@example.com');
    const optionsResponse = await post('/api/auth/login/options', {});
    const { options } = await optionsResponse.json();
    const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: process.env.WEBAUTHN_ORIGIN, crossOrigin: false }));
    const counter = Buffer.alloc(4); counter.writeUInt32BE(1);
    const authData = Buffer.concat([hash('localhost'), Buffer.from([0x05]), counter]);
    const signature = crypto.sign('sha256', Buffer.concat([authData, hash(client)]), account.privateKey);
    const body = { challenge: options.challenge, credential: { id: b64(account.id), rawId: b64(account.id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(client), authenticatorData: b64(authData), signature: b64(signature), userHandle: account.userHandle } } };
    const response = await post('/api/auth/login/verify', body);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    account.token = (await response.json()).token;
    assert.equal((await verifyToken(account.token)).user_id, account.user.id);
    assert.equal(q.getPasskeyCredentialById(b64(account.id)).counter, 1);
    assert.equal((await post('/api/auth/login/verify', body)).status, 400);
  });
  await t.test('wrong user and ceremony challenges are rejected before cryptographic verification', async () => {
    const invite = crypto.randomUUID();
    q.createInviteToken('other@example.com', invite, new Date(Date.now() + 60000).toISOString());
    const options = await post('/api/auth/register/options', { token: invite, displayName: 'Other' });
    assert.equal(options.status, 200);
    for (const [type, userId] of [['authentication', account.user.id], ['registration', account.user.id]]) {
      const challenge = crypto.randomUUID();
      q.storeChallenge(challenge, userId, type, new Date(Date.now() + 60000).toISOString());
      const response = await post('/api/auth/register/verify', { token: invite, challenge, credential: {} });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Invalid registration challenge');
    }
    const challenge = crypto.randomUUID();
    q.storeChallenge(challenge, account.user.id, 'registration', new Date(Date.now() + 60000).toISOString());
    assert.equal((await post('/api/auth/login/verify', { challenge, credential: {} })).status, 400);
  });
  await t.test('expired ISO challenges are deleted and live challenges survive', () => {
    q.storeChallenge('expired', null, 'authentication', new Date(Date.now() - 60000).toISOString());
    q.storeChallenge('live', null, 'authentication', new Date(Date.now() + 60000).toISOString());
    q.cleanupExpiredChallenges();
    assert.equal(q.consumeChallenge('expired'), undefined);
    assert.ok(q.consumeChallenge('live'));
  });
  await t.test('authenticated read endpoints, key-only map config and admin operations', async () => {
    const headers = { Authorization: `Bearer ${account.token}` };
    assert.equal((await app.request('/api/map-config')).status, 401);
    assert.equal((await app.request('/api/map-config', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const response = await app.request('/api/map-config', { headers });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { cartoBasemapApiKey: 'test-map-key' });
    for (const endpoint of ['/api/auth/me', '/api/stats', '/api/locations', '/api/domains', '/api/countries', '/api/status', '/api/threats', '/api/logs']) {
      assert.equal((await app.request(endpoint, { headers })).status, 200, endpoint);
    }
    for (const endpoint of ['/api/threats/rescan', '/api/geo/process', '/api/admin/invite']) {
      assert.equal((await post(endpoint, {}, headers)).status, 403, endpoint);
    }
    const adminToken = await createToken({ ...account.user, is_admin: true });
    const invited = await post('/api/admin/invite', { email: 'invited@example.com' }, { Authorization: `Bearer ${adminToken}` });
    assert.equal(invited.status, 200);
    assert.ok((await invited.json()).invite.registration_url.startsWith(process.env.WEBAUTHN_ORIGIN));
    for (const endpoint of ['/api/geo/process', '/api/threats/rescan']) {
      assert.equal((await post(endpoint, {}, { Authorization: `Bearer ${adminToken}` })).status, 200, endpoint);
    }
    assert.equal((await post('/api/auth/login/options', { padding: 'x'.repeat(65536) })).status, 413);
  });
  await t.test('rate limits recover and ignore spoofed forwarded addresses', async () => {
    let clock = 0;
    const limiter = new Hono();
    limiter.use('*', createAuthRateLimiter({ limit: 2, windowMs: 1000, now: () => clock }));
    limiter.get('/', c => c.json({ ok: true }));
    assert.equal((await limiter.request('/')).status, 200);
    assert.equal((await limiter.request('/', { headers: { 'X-Forwarded-For': '203.0.113.1' } })).status, 200);
    const blocked = await limiter.request('/', { headers: { 'X-Forwarded-For': '203.0.113.2' } });
    assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('Retry-After'), '1');
    clock = 1001;
    assert.equal((await limiter.request('/')).status, 200);
  });
  await t.test('redaction preserves attack patterns and original logs; AI has a timeout', async () => {
    const input = [{ path: '/search?token=private&password=secret&q=SELECT%201', ua: 'Bearer private' }];
    const output = redactSecrets(input);
    assert.equal(output[0].path, '/search?token=[REDACTED]&password=[REDACTED]&q=SELECT%201');
    assert.equal(output[0].ua, 'Bearer [REDACTED]');
    assert.ok(input[0].path.includes('token=private'));
    const previousFetch = global.fetch;
    const previousKey = process.env.OPEN_AI_API_KEY;
    const previousModel = process.env.OPEN_AI_API_MODEL;
    process.env.OPEN_AI_API_KEY = 'test'; process.env.OPEN_AI_API_MODEL = 'test';
    try {
      global.fetch = async (url, options) => {
        assert.ok(options.signal instanceof AbortSignal);
        const prompt = JSON.parse(options.body).messages[0].content;
        assert.ok(!prompt.includes('token=private'));
        assert.ok(prompt.includes('SELECT%201'));
        return { ok: true, json: async () => ({ choices: [{ message: { content: '{"threat_found":false}' } }] }) };
      };
      const { analyzeIpBehavior } = require('../src/geo/threat');
      assert.equal(await analyzeIpBehavior('203.0.113.1', input, 1, 'example.com'), false);
      global.fetch = async () => { throw new Error('simulated timeout'); };
      assert.equal(await analyzeIpBehavior('203.0.113.1', [{ path: '/.env', status: 404 }], 1, 'example.com'), true);
    } finally {
      global.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.OPEN_AI_API_KEY; else process.env.OPEN_AI_API_KEY = previousKey;
      if (previousModel === undefined) delete process.env.OPEN_AI_API_MODEL; else process.env.OPEN_AI_API_MODEL = previousModel;
    }
  });
  await t.test('threat fields render as text and rescan is available to administrators', async () => {
    const dom = domFor('public/threats.html'); const w = dom.window;
    t.after(() => w.close());
    const payload = '<img src=x onerror="alert(1)">';
    const incident = { ip: payload, host: payload, summary: payload, explanation: payload, details: JSON.stringify([payload]), isp: payload, country: payload, country_flag: payload, threat_level: 'critical', risk_score: 90, request_count: 4, incident_unix: 1 };
    w.Auth = { isAuthenticated: () => true, getUser: () => ({ is_admin: true }), fetch: async () => ({ json: async () => ({ success: true, data: [incident] }) }) };
    w.setInterval = () => 0;
    run(dom, inlineScript(read('public/threats.html'), 'async function loadThreats'));
    await w.loadThreats();
    assert.equal(w.document.querySelectorAll('#timeline-container img').length, 0);
    assert.ok(w.document.querySelector('.finding-chip').textContent.includes(payload));
    assert.equal(w.document.getElementById('rescan-btn').hidden, false);
    assert.ok(w.document.querySelector('.badge-critical'));
  });
  await t.test('map details, log table, snackbars and invite links keep untrusted values inert', async () => {
    const dom = domFor('public/index.html'); const w = dom.window;
    t.after(() => w.close());
    run(dom, read('public/js/map.js'));
    run(dom, read('public/js/app.js').replace(/document.addEventListener\('DOMContentLoaded', initApp\);/, ''));
    const payload = '" onmouseover="alert(1)"><img src=x onerror=alert(1)>';
    const location = { city: payload, country: payload, region: payload, request_count: 12, unique_ips: 3 };
    const openData = w.showLocationData;
    let clicked;
    w.showLocationData = value => clicked = value;
    const popup = w.createPopupContent(location);
    assert.equal(popup.querySelectorAll('img,[onmouseover],[onclick]').length, 0);
    popup.querySelector('button').click(); assert.equal(clicked, location);
    assert.ok(popup.querySelector('.popup-title').textContent.includes(payload));
    assert.equal(popup.querySelector('.popup-stat-value').textContent, '12');
    w.HTMLElement.prototype.animate = () => ({});
    w.showSnackbar({ host: payload, client_ip: payload, city: payload, country: payload, isp: payload, device_type: 'desktop' });
    assert.equal(w.document.querySelectorAll('#snackbar-container img,#snackbar-container [onmouseover]').length, 0);
    assert.equal(w.document.querySelector('#snackbar-container .snackbar-value').getAttribute('title'), payload);
    w.populateCountryFilter([{ country_code: 'TT', country: 'Test & Country', country_flag: '' }]);
    assert.equal(w.document.querySelector('#filter-country option[value="TT"]').textContent, ' Test & Country');
    w.fetchAPI = async () => ({ success: true, data: [{ host: payload, status: 200, method: payload, device_type: payload, client_ip: payload, isp: payload, path: payload, timestamp: new Date().toISOString() }] });
    run(dom, 'map = { closePopup() {} };');
    await openData(location);
    assert.equal(w.document.querySelectorAll('#modal-table-body img,#modal-table-body [onmouseover]').length, 0);
    assert.equal(w.document.querySelector('.method-badge').textContent, payload);
    w.togglePathRows(0);
    assert.ok(w.document.querySelector('.path-row').classList.contains('visible'));
    assert.equal(w.safeInviteUrl('javascript:alert(1)'), '#');
    assert.equal(w.safeInviteUrl('https://evil.example/register'), '#');
    assert.equal(w.safeInviteUrl('/register?token=example'), process.env.WEBAUTHN_ORIGIN + '/register?token=example');
  });
  await t.test('invite history escapes email and prevents executable URLs', () => {
    const dom = domFor('public/admin.html'); const w = dom.window;
    t.after(() => w.close());
    w.Auth = { isAuthenticated: () => true, getUser: () => ({ is_admin: true }) };
    run(dom, inlineScript(read('public/admin.html'), 'function renderInvites'));
    run(dom, 'invites.push({ email: "<img src=x onerror=alert(1)>@example.com", registration_url: "javascript:alert(1)", expires_at: new Date().toISOString() }); renderInvites();');
    assert.equal(w.document.querySelectorAll('#invite-history img').length, 0);
    assert.equal(w.document.querySelector('.invite-url').getAttribute('href'), '#');
  });
});
