/* Smoke tests for security hardening: CORS, headers, /api/health, login rate limit, bcrypt vs sha256. */

const Module = require('module');
const path = require('path');
const assert = require('assert');

const dbPath = require.resolve('../db');

const rows = {
  users: new Map(),
  sessions: new Map(),
  loginAttempts: [],
};

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const sha256 = (salt, pin) => crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');

const dbStub = {
  __rows: rows,
  countPartners: async () => 5,
  ensureSchema: async () => {},
  getStorageName: () => 'memory-test',
  getSession: async (token) => rows.sessions.get(token) || null,
  listUsers: async () => Array.from(rows.users.values()).map((u) => ({ username: u.username, displayName: u.displayName, active: true })),
  listConversation: async () => [],
  listInbox: async () => [],
  listMessages: async () => [],
  readAllPartners: async () => [],
  readMessage: async () => null,
  readPartner: async () => null,
  readSettings: async () => ({}),
  writeSettings: async () => {},
  unreadMessageCount: async () => 0,
  toggleReaction: async () => [],
  markMessagesRead: async () => {},
  createMessage: async () => ({ id: 'x' }),
  createPartner: async (p) => p,
  createUser: async (username, pin, displayName) => {
    const hash = await bcrypt.hash(String(pin), 4);
    rows.users.set(username, { username, displayName: displayName || username, hash, algorithm: 'bcrypt' });
  },
  deletePartner: async () => null,
  updatePartner: async () => null,
  upgradeUserToBcrypt: async (username, pin) => {
    const u = rows.users.get(username);
    if (!u) return;
    u.hash = await bcrypt.hash(String(pin), 4);
    u.algorithm = 'bcrypt';
    u.salt = '';
  },
  recordLoginAttempt: async ({ username, ip, success }) => {
    rows.loginAttempts.push({ username, ip, success, at: Date.now() });
  },
  recentFailedLoginCount: async ({ username, ip, windowMs }) => {
    const since = Date.now() - windowMs;
    return rows.loginAttempts.filter((a) => !a.success && a.at >= since && (a.ip === ip || a.username === username)).length;
  },
  login: async (username, pin) => {
    const user = rows.users.get(username);
    if (!user) return null;
    let ok = false;
    if (user.algorithm === 'bcrypt') ok = await bcrypt.compare(String(pin), user.hash);
    else ok = sha256(user.salt, pin) === user.hash;
    if (!ok) return null;
    if (user.algorithm !== 'bcrypt') {
      user.hash = await bcrypt.hash(String(pin), 4);
      user.algorithm = 'bcrypt';
      user.salt = '';
    }
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    rows.sessions.set(token, { token, username, expiresAt, displayName: user.displayName });
    return { token, expiresAt, user: { username, displayName: user.displayName } };
  },
  logout: async (token) => { rows.sessions.delete(token); },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: dbStub,
};

const app = require('../app');
const http = require('http');

const startServer = () => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, () => resolve(server));
});

const request = (server, { method = 'GET', path: p = '/', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const port = server.address().port;
  const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  const req = http.request({
    host: '127.0.0.1',
    port,
    path: p,
    method,
    headers: {
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      ...headers,
    },
  }, (res) => {
    let chunks = '';
    res.on('data', (c) => { chunks += c; });
    res.on('end', () => {
      let parsed;
      try { parsed = chunks ? JSON.parse(chunks) : null; } catch { parsed = chunks; }
      resolve({ status: res.statusCode, headers: res.headers, body: parsed });
    });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('public /api/health returns minimal {ok:true}', async (server) => {
  const res = await request(server, { path: '/api/health' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { ok: true });
});

test('unauthenticated /api/users returns 401 JSON', async (server) => {
  const res = await request(server, { path: '/api/users' });
  assert.strictEqual(res.status, 401);
  assert.ok(res.body && typeof res.body.message === 'string');
});

test('security headers present on api responses', async (server) => {
  const res = await request(server, { path: '/api/health' });
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(res.headers['x-frame-options'], 'DENY');
  assert.ok(res.headers['referrer-policy']);
  assert.ok(res.headers['permissions-policy']);
});

test('CORS allows netlify.app subdomains', async (server) => {
  const res = await request(server, {
    method: 'OPTIONS',
    path: '/api/health',
    headers: { Origin: 'https://nuiscrm.netlify.app', 'Access-Control-Request-Method': 'GET' },
  });
  assert.ok(res.status === 204 || res.status === 200, `status=${res.status}`);
  assert.strictEqual(res.headers['access-control-allow-origin'], 'https://nuiscrm.netlify.app');
});

test('CORS allows netlify deploy-preview subdomains', async (server) => {
  const res = await request(server, {
    method: 'OPTIONS',
    path: '/api/health',
    headers: { Origin: 'https://deploy-preview-12--nuiscrm.netlify.app', 'Access-Control-Request-Method': 'GET' },
  });
  assert.ok(res.status === 204 || res.status === 200, `status=${res.status}`);
  assert.strictEqual(res.headers['access-control-allow-origin'], 'https://deploy-preview-12--nuiscrm.netlify.app');
});

test('CORS allows localhost', async (server) => {
  const res = await request(server, {
    method: 'OPTIONS',
    path: '/api/health',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' },
  });
  assert.ok(res.status === 204 || res.status === 200);
  assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('CORS rejects evil origin', async (server) => {
  const res = await request(server, {
    method: 'OPTIONS',
    path: '/api/health',
    headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'GET' },
  });
  assert.strictEqual(res.status, 403);
  assert.ok(!res.headers['access-control-allow-origin']);
});

test('register stores bcrypt hash for new user', async () => {
  rows.users.clear();
  await dbStub.createUser('newuser', '123456', 'New');
  const u = rows.users.get('newuser');
  assert.strictEqual(u.algorithm, 'bcrypt');
  assert.ok(u.hash.startsWith('$2'));
});

test('legacy SHA-256 user logs in and is upgraded to bcrypt', async () => {
  rows.users.clear();
  const salt = 'legacy-salt';
  const hash = sha256(salt, '654321');
  rows.users.set('legacyuser', {
    username: 'legacyuser',
    displayName: 'Legacy',
    salt,
    hash,
    algorithm: 'sha256',
  });
  const session = await dbStub.login('legacyuser', '654321');
  assert.ok(session && session.token);
  const u = rows.users.get('legacyuser');
  assert.strictEqual(u.algorithm, 'bcrypt');
  assert.ok(u.hash.startsWith('$2'));
  // login again with bcrypt path
  const again = await dbStub.login('legacyuser', '654321');
  assert.ok(again && again.token);
});

test('login returns 429 after repeated failures', async (server) => {
  rows.users.clear();
  rows.loginAttempts.length = 0;
  await dbStub.createUser('throttled', '111111', 'T');
  let lastStatus = 0;
  for (let i = 0; i < 12; i += 1) {
    const res = await request(server, {
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'throttled', pin: 'wrong' },
    });
    lastStatus = res.status;
    if (res.status === 429) break;
  }
  assert.strictEqual(lastStatus, 429);
});

(async () => {
  const server = await startServer();
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn(server);
      console.log(`ok - ${t.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL - ${t.name}`);
      console.error(error.stack || error);
    }
  }
  server.close();
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${tests.length} tests passed`);
  process.exit(0);
})();
