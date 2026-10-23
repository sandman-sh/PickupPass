# Build notes

## 2026-10-22

- Created the first PickupPass MVP in an empty workspace.
- Implemented deterministic Ring simulator events, server-side claim-code verification, rejection, escalation, and an activity feed.
- Verified the dashboard returns HTTP 200, simulator events create a pending item, approval works with Maya's code `4829`, and the wrong-code path returns `valid: false` with a rejected event.
- The external submission connector currently requires reauthentication; local product work remains fully independent of that connection.
- Added a server-side pickup policy engine with early, expired, duplicate-release, invalid-code, and approved outcomes.
- Added Ring device/source evidence, decision ownership, timestamps, persisted policy records, and explanation text to the audit trail.
- Added an optional Amazon Bedrock Converse explanation path with a deterministic local fallback.
- Added the timed demo script, product feedback, and friction log required for the final handoff.
