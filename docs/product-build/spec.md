# PickupPass technical specification

## Runtime

- Node.js 20+.
- Node's built-in `http` server serves the static frontend and JSON API; no dependency install is required for the MVP.
- Browser frontend is vanilla JavaScript, CSS, and semantic HTML.

## Components

### Dashboard (`public/index.html`, `public/styles.css`)

Glanceable front-desk UI: live shift header, pending attention card, roster, activity feed, and verification modal.

### Client state (`public/app.js`)

Fetches `/api/state`, renders state, opens the verification modal, submits decisions, and displays feedback. The client never decides authorization locally; it sends the selected event, person, and code to the server.

### API server (`server.js`)

- `GET /api/state`: returns roster, recent events, pending event, and integration mode.
- `POST /api/ring/simulator/event`: creates a normalized arrival event for demo use.
- `POST /api/verify`: validates the claim code against the selected roster record and records approval/rejection.
- `POST /api/resolve`: records guardian escalation.
- `GET /api/state`: also reports the Bedrock explanation configuration without exposing credentials.

### Ring adapter seam

`ring-client.js` is the Ring Developer API boundary. It exchanges Ring authorization codes at `https://oauth.ring.com/oauth/token`, stores and refreshes server-side access tokens, calls `https://api.amazonvision.com` with a bearer token, verifies `X-Signature` with HMAC-SHA256, normalizes Ring JSON:API webhook payloads, extracts device/classification evidence, applies a request timeout, and exposes device discovery. The local simulator supplies the same event shape only as a deterministic development fallback when no Ring test account is linked. Verification and audit behavior are unchanged across both sources.

## Important data flow

Ring event → normalized event with source/device/time evidence → pending attention card → selected roster person + claim code → server-side policy evaluation → optional Bedrock explanation → decision record → activity feed.

### Policy engine

`policy.js` is the authority for pickup outcomes. It evaluates the claim code, the person’s window, the event clock, and prior release records. It returns a structured status: `approved`, `code_invalid`, `too_early`, `window_expired`, or `already_released`.

### Explanation layer

`bedrock-explainer.js` uses the AWS SDK for JavaScript and the Bedrock Converse API with `amazon.nova-lite-v1:0` when enabled. The prompt explicitly says the policy result is authoritative and the model must not authorize a release. Missing credentials, SDK errors, or a disabled flag return a local explanation with the same policy result.

## Demo reliability

The official integration path uses a Ring Developer test account and webhook configured in the Ring Developer Portal. The local simulator is intentionally deterministic and local for offline development. `RING_ACCESS_TOKEN` enables live device discovery, `RING_HMAC_KEY` enables signed webhook verification, and `BEDROCK_ENABLED=true` enables the live explanation path when AWS credentials are available.
