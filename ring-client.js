const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RING_API_BASE_URL = process.env.RING_API_BASE_URL || 'https://api.amazonvision.com';
const RING_OAUTH_TOKEN_URL = process.env.RING_OAUTH_TOKEN_URL || 'https://oauth.ring.com/oauth/token';
const RING_REQUEST_TIMEOUT_MS = Number(process.env.RING_REQUEST_TIMEOUT_MS || 10000);
const RING_TOKEN_FILE = path.join(__dirname, 'data', 'ring-tokens.json');

function readStoredTokens() {
  try {
    return JSON.parse(fs.readFileSync(RING_TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function storeTokens(response) {
  fs.mkdirSync(path.dirname(RING_TOKEN_FILE), { recursive: true });
  const tokens = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    tokenType: response.token_type || 'Bearer',
    scope: response.scope || '',
    expiresAt: response.expires_in ? Date.now() + Number(response.expires_in) * 1000 : null,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(RING_TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

async function exchangeAuthorizationCode({ code, clientId, clientSecret, codeVerifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  const response = await fetch(RING_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok || !payload?.access_token) {
    const error = new Error(`Ring OAuth token exchange failed (${response.status}).`);
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return storeTokens(payload);
}

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });
  const response = await fetch(RING_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok || !payload?.access_token) {
    const error = new Error(`Ring OAuth token refresh failed (${response.status}).`);
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return storeTokens(payload);
}

async function resolveAccessToken() {
  if (process.env.RING_ACCESS_TOKEN) return process.env.RING_ACCESS_TOKEN;
  const stored = readStoredTokens();
  if (!stored?.accessToken) return null;
  if (!stored.expiresAt || stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
  if (!stored.refreshToken || !process.env.RING_CLIENT_ID || !process.env.RING_CLIENT_SECRET) return stored.accessToken;
  const refreshed = await refreshAccessToken(stored.refreshToken, process.env.RING_CLIENT_ID, process.env.RING_CLIENT_SECRET);
  return refreshed.accessToken;
}

function integrationStatus() {
  const stored = readStoredTokens();
  const linked = Boolean(process.env.RING_ACCESS_TOKEN || stored?.accessToken);
  return {
    provider: 'Ring by Amazon',
    mode: linked ? 'connected' : 'sandbox',
    apiBaseUrl: RING_API_BASE_URL,
    oauthTokenUrl: RING_OAUTH_TOKEN_URL,
    auth: process.env.RING_ACCESS_TOKEN ? 'bearer-token' : stored?.accessToken ? 'oauth-token' : 'not-configured',
    webhookReady: Boolean(process.env.RING_HMAC_KEY),
    webhookMode: process.env.RING_HMAC_KEY ? 'hmac-verified' : 'development-mode',
    linked
  };
}

async function ringRequest(endpoint, options = {}) {
  const accessToken = await resolveAccessToken();
  if (!accessToken) {
    const error = new Error('Ring account is not linked. Add RING_ACCESS_TOKEN to enable live API calls.');
    error.code = 'RING_NOT_LINKED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RING_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(new URL(endpoint, RING_API_BASE_URL), {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'application/vnd.api+json, application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Ring API request timed out after ${RING_REQUEST_TIMEOUT_MS}ms.`);
      timeoutError.code = 'RING_API_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(`Ring API returned ${response.status}.`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function listDevices() {
  return ringRequest('/v1/devices?include=status,capabilities,location');
}

function verifyWebhookSignature(rawBody, signature, secret = process.env.RING_HMAC_KEY) {
  if (!secret) return { valid: false, configured: false };
  const received = String(signature || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const valid = received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  return { valid, configured: true };
}

function normalizeRingWebhook(payload) {
  const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  const attributes = data?.attributes || payload?.attributes || {};
  const type = data?.type || attributes.event_type || attributes.eventName || 'motion_detected';
  const requestId = payload?.meta?.request_id || payload?.meta?.requestId || data?.id || crypto.randomUUID();
  const deviceId = attributes.source || attributes.device_id || data?.relationships?.devices?.data?.[0]?.id || 'ring-device';
  const occurredAt = new Date(
    payload?.meta?.time || payload?.meta?.occurred_at || attributes.occurred_at || attributes.occurredAt || attributes.timestamp || Date.now()
  );
  const eventName = type.replaceAll('_', ' ');
  return {
    id: `ring-${requestId}`,
    type: 'arrival',
    ringType: type,
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(occurredAt),
    eventClock: `${String(occurredAt.getHours()).padStart(2, '0')}:${String(occurredAt.getMinutes()).padStart(2, '0')}`,
    occurredAt: occurredAt.toISOString(),
    location: attributes.location_name || 'Front entrance',
    label: 'Ring arrival detected',
    detail: `Ring reported ${eventName} at the entrance. Verification is required before release.`,
    status: 'attention',
    person: null,
    source: 'ring-webhook',
    deviceId,
    deviceName: attributes.device_name || attributes.deviceName || attributes.source_name || attributes.location_name || 'Ring device',
    classification: attributes.classification || attributes.detection || null,
    confidence: attributes.confidence ?? null,
    doorbellPressed: Boolean(attributes.doorbell_pressed || attributes.doorbellPressed),
    requestId
  };
}

module.exports = {
  RING_API_BASE_URL,
  RING_OAUTH_TOKEN_URL,
  integrationStatus,
  ringRequest,
  listDevices,
  exchangeAuthorizationCode,
  verifyWebhookSignature,
  normalizeRingWebhook
};
