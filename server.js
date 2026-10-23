const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const { integrationStatus, listDevices, exchangeAuthorizationCode, verifyWebhookSignature, normalizeRingWebhook } = require('./ring-client');
const { evaluatePickup, formatClock } = require('./policy');
const { explainDecision, FALLBACK_MODEL } = require('./bedrock-explainer');

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SOURCE_DATA_FILE = path.join(DATA_DIR, 'events.json');
const serverlessHost = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV || __dirname.startsWith('/var/task'));
const runtimeDataDir = process.env.PICKUPPASS_DATA_DIR
  ? path.resolve(process.env.PICKUPPASS_DATA_DIR)
  : serverlessHost
    ? path.join(os.tmpdir(), 'pickuppass')
    : DATA_DIR;
const runtimeDataFile = path.join(runtimeDataDir, 'events.json');

const roster = [
  { id: 'maya', name: 'Maya Patel', initials: 'MP', role: 'Parent', child: 'Aarav Patel', window: '3:30–5:00 PM', code: '4829', color: 'violet' },
  { id: 'jordan', name: 'Jordan Lee', initials: 'JL', role: 'Grandparent', child: 'Noah Lee', window: '4:00–6:00 PM', code: '1936', color: 'blue' },
  { id: 'sam', name: 'Sam Rivera', initials: 'SR', role: 'Authorized pickup', child: 'Lena Rivera', window: '3:00–4:30 PM', code: '7714', color: 'green' }
];

const starterEvents = [
  { id: 'evt-1001', type: 'arrival', time: '3:42 PM', eventClock: '15:42', occurredAt: new Date().toISOString(), location: 'Front entrance', label: 'Arrival detected', detail: 'Visitor is waiting at the front entrance.', status: 'attention', person: null, source: 'ring-simulator', deviceId: 'oakline-front-door', deviceName: 'Oakline Front Door', ringType: 'motion_detected' },
  { id: 'evt-0999', type: 'release', time: '3:18 PM', eventClock: '15:18', occurredAt: new Date().toISOString(), location: 'Front entrance', label: 'Handoff completed', detail: 'Jordan Lee picked up Noah Lee.', status: 'approved', person: 'jordan', child: 'Noah Lee', policyStatus: 'approved', source: 'ring-simulator', deviceId: 'oakline-front-door', deviceName: 'Oakline Front Door' },
  { id: 'evt-0998', type: 'arrival', time: '2:56 PM', eventClock: '14:56', occurredAt: new Date().toISOString(), location: 'Front entrance', label: 'Arrival detected', detail: 'Visitor verified with a valid claim code.', status: 'approved', person: 'sam', child: 'Lena Rivera', policyStatus: 'approved', source: 'ring-simulator', deviceId: 'oakline-front-door', deviceName: 'Oakline Front Door', ringType: 'motion_detected' }
];

try { fs.mkdirSync(runtimeDataDir, { recursive: true }); } catch { /* The app can still run in memory. */ }
const initialDataFile = fs.existsSync(runtimeDataFile) ? runtimeDataFile : SOURCE_DATA_FILE;
let events = fs.existsSync(initialDataFile) ? JSON.parse(fs.readFileSync(initialDataFile, 'utf8')) : starterEvents;
const processedRingRequests = new Set(events.map(event => event.requestId).filter(Boolean));

function persist() {
  try {
    fs.mkdirSync(runtimeDataDir, { recursive: true });
    fs.writeFileSync(runtimeDataFile, JSON.stringify(events.slice(0, 24), null, 2));
  } catch (error) {
    // Serverless filesystems are ephemeral or read-only. Keep the current
    // invocation usable instead of failing the Ring action after the state
    // has already been updated in memory.
    console.warn(`PickupPass could not persist runtime state: ${error.message}`);
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseFormBody(req) {
  const raw = await parseRawBody(req);
  return Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
}

function nowLabel() {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function clockLabel(eventClock) {
  const [hour, minute] = String(eventClock).split(':').map(Number);
  return formatClock(hour * 60 + minute);
}

function ringEvent(payload = {}) {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'arrival',
    time: payload.time || (payload.eventClock ? clockLabel(payload.eventClock) : nowLabel()),
    eventClock: payload.eventClock || '15:42',
    occurredAt: payload.occurredAt || new Date().toISOString(),
    location: payload.location || 'Front entrance',
    label: 'Arrival detected',
    detail: 'Ring reported a person at the entrance. Verification is required before release.',
    status: 'attention',
    person: null,
    source: payload.source || 'ring-simulator',
    deviceId: payload.deviceId || 'oakline-front-door',
    deviceName: payload.deviceName || 'Oakline Front Door',
    ringType: payload.ringType || 'motion_detected'
  };
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, {
      roster: roster.map(({ code, ...person }) => person),
      events,
      pending: events.find(e => e.status === 'attention') || null,
      integration: integrationStatus(),
      bedrock: { enabled: process.env.BEDROCK_ENABLED === 'true', model: process.env.BEDROCK_MODEL_ID || FALLBACK_MODEL }
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/ring/simulator/event') {
    const payload = await parseBody(req);
    const event = ringEvent(payload);
    events.unshift(event);
    events = events.slice(0, 12);
    persist();
    return sendJson(res, 201, event);
  }
  if (req.method === 'POST' && url.pathname === '/api/ring/oauth/token') {
    const form = await parseFormBody(req);
    const expectedClientId = process.env.RING_CLIENT_ID;
    if (!expectedClientId || !process.env.RING_CLIENT_SECRET) {
      return sendJson(res, 503, { error: 'Ring OAuth credentials are not configured on this server.', code: 'RING_OAUTH_NOT_CONFIGURED' });
    }
    if (!form.code || (form.client_id && form.client_id !== expectedClientId)) {
      return sendJson(res, 400, { error: 'Ring OAuth request is missing a valid authorization code or client ID.' });
    }
    try {
      const tokens = await exchangeAuthorizationCode({
        code: form.code,
        clientId: expectedClientId,
        clientSecret: process.env.RING_CLIENT_SECRET,
        codeVerifier: form.code_verifier
      });
      return sendJson(res, 200, { linked: true, tokenType: tokens.tokenType, scope: tokens.scope, expiresAt: tokens.expiresAt });
    } catch (error) {
      return sendJson(res, error.status && error.status >= 400 && error.status < 500 ? 400 : 502, { error: error.message, code: 'RING_OAUTH_EXCHANGE_FAILED' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/ring/oauth/status') {
    const integration = integrationStatus();
    return sendJson(res, 200, { linked: integration.linked, auth: integration.auth, webhookReady: integration.webhookReady });
  }
  if (req.method === 'POST' && url.pathname === '/api/ring/webhook') {
    const rawBody = await parseRawBody(req);
    const signature = verifyWebhookSignature(rawBody, req.headers['x-signature']);
    if (signature.configured && !signature.valid) return sendJson(res, 401, { error: 'Invalid Ring webhook signature.' });
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Ring webhook body must be JSON.' }); }
    const event = normalizeRingWebhook(payload);
    if (processedRingRequests.has(event.requestId)) return sendJson(res, 200, { duplicate: true, requestId: event.requestId });
    processedRingRequests.add(event.requestId);
    events.unshift(event);
    events = events.slice(0, 12);
    persist();
    return sendJson(res, 201, { accepted: true, event, signature: signature.configured ? 'verified' : 'development-mode' });
  }
  if (req.method === 'GET' && url.pathname === '/api/ring/devices') {
    try {
      const devices = await listDevices();
      return sendJson(res, 200, { connected: true, devices });
    } catch (error) {
      const status = error.code === 'RING_NOT_LINKED' ? 412 : (error.status || 502);
      return sendJson(res, status, { connected: false, error: error.message, code: error.code || 'RING_API_ERROR' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/verify') {
    const payload = await parseBody(req);
    const event = events.find(e => e.id === payload.eventId);
    const person = roster.find(p => p.id === payload.personId);
    if (!event || !person) return sendJson(res, 404, { error: 'Event or pickup person not found.' });
    if (event.status !== 'attention') return sendJson(res, 409, { error: 'This arrival already has a recorded decision.' });
    const policy = evaluatePickup({ event, person, code: payload.code, events });
    const valid = policy.status === 'approved';
    const decidedAt = new Date().toISOString();
    event.person = person.id;
    event.child = person.child;
    event.policyStatus = policy.status;
    event.policy = policy;
    event.decision = { status: policy.status, actor: 'Alex Rivera', decidedAt, personId: person.id, child: person.child };
    event.decidedAt = decidedAt;
    event.decidedBy = 'Alex Rivera';
    event.status = valid ? 'approved' : 'rejected';
    event.label = policy.label;
    event.detail = policy.detail;
    const explanation = await explainDecision({ policy, event, person });
    event.explanation = explanation;
    if (valid) {
      events.unshift({
        id: `evt-${Date.now()}-release`, type: 'release', time: nowLabel(), eventClock: event.eventClock,
        occurredAt: new Date().toISOString(), location: event.location, label: 'Handoff completed',
        detail: `${person.name} picked up ${person.child}.`, status: 'approved', person: person.id,
        child: person.child, policyStatus: policy.status, policy, decision: event.decision,
        explanation, source: event.source, deviceId: event.deviceId, deviceName: event.deviceName, ringType: event.ringType
      });
    }
    persist();
    return sendJson(res, 200, { valid, event, policy, explanation, message: valid ? 'Release approved. The handoff is logged.' : policy.nextAction });
  }
  if (req.method === 'POST' && url.pathname === '/api/resolve') {
    const payload = await parseBody(req);
    const event = events.find(e => e.id === payload.eventId);
    if (!event) return sendJson(res, 404, { error: 'Event not found.' });
    event.status = 'escalated';
    event.label = 'Escalated to guardian';
    event.detail = 'Staff requested a guardian callback before releasing the child.';
    event.policyStatus = 'escalated';
    event.decision = { status: 'escalated', actor: 'Alex Rivera', decidedAt: new Date().toISOString(), nextAction: 'Wait for a guardian callback before releasing.' };
    persist();
    return sendJson(res, 200, event);
  }
  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'Not found' });
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': `${types[ext] || 'application/octet-stream'}; charset=utf-8` });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else serveStatic(req, res, url); }
  catch (error) { sendJson(res, 400, { error: error.message }); }
});

server.listen(PORT, () => console.log(`PickupPass running at http://localhost:${PORT}`));
