# PickupPass demo script

Target length: 2 minutes 20 seconds. Record the browser window and keep the narration calm and specific.

## 0:00–0:20 — The moment

“At a busy front desk, an arrival is not permission to release a child. PickupPass turns that arrival into one safe decision: who is here, which child are they collecting, is the time window valid, and what evidence do we keep?”

Show the dashboard, the pending arrival card, the Ring source, the Oakline Front Door device, and the motion type.

## 0:20–0:55 — The safe approval path

Click **Review arrival**, select Maya Patel, enter `4829`, and verify.

“The coordinator chooses a person from today’s roster and enters the claim code. The server applies the policy. A valid code inside the active pickup window creates an approved handoff, records the child, records the coordinator, and keeps the Ring evidence beside the decision.”

Pause on the explanation card and the approved activity row.

## 0:55–1:30 — The negative path

Create a new arrival. Select Maya Patel and enter `0000`.

“A bad code never becomes a partial approval. The policy engine returns a clear do-not-release decision, and the explanation layer states the next safe action. Staff can open the audit trail and see the source, device, policy status, and explanation.”

Open **View audit trail** and scroll to the blocked record.

## 1:30–1:55 — Time-window protection

Use the local API to create a recorded arrival at `15:10`, then verify Maya with `4829`.

“The code alone is not enough. Before Maya’s 3:30 PM window, the same correct code is blocked as too early. After the window closes, it is blocked again. This is the difference between a code checker and an operational safety workflow.”

## 1:55–2:15 — Escalation and integration

Create one more arrival, open the review modal, and click **I can’t verify this person — escalate to guardian**. Click **Sync devices** to show the Ring connection status.

“When the coordinator cannot verify the visitor, the safe action is escalation. Nothing is released. The Ring adapter also supports live device discovery and signed webhook events, while the local simulator keeps the demo repeatable.”

## 2:15–2:20 — Close

“PickupPass makes the next safe action visible, keeps the policy deterministic, and leaves an audit trail that another person can trust.”

## Recording notes

- Use a clean browser at `http://localhost:4173`.
- Keep the video below three minutes.
- Show both the approved and blocked outcomes.
- Do not show secret tokens or local credential files.
- If AWS credentials are configured, the explanation card may say **Amazon Bedrock**. Otherwise it will say **Policy explainer** and still show the same deterministic policy result.
