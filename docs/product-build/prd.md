# PickupPass product requirements

## Epic 1 — See the next safe action

As a site coordinator, I want a clear dashboard state so I know whether an arrival needs a decision.

Acceptance:

- The dashboard shows the number of pending arrivals.
- A pending arrival shows time, location, source, and an explicit verification action.
- When no arrival is pending, the dashboard says that all arrivals are accounted for.

## Epic 2 — Verify a claimed pickup

As a coordinator, I want to select a person from today's authorized roster and enter their claim code so I can decide whether to release a child.

Acceptance:

- The modal lists authorized people and the child each person may pick up.
- The coordinator cannot verify without choosing a person and entering four digits.
- A matching code produces an approval message and names the child and authorized person.
- A wrong code produces a rejection message that clearly says not to release.

## Epic 3 — Keep an accountable record

As a care team, we want each decision time-stamped so a handoff can be reviewed later.

Acceptance:

- Approved, rejected, escalated, and arrival events appear in the recent activity feed.
- Each activity includes a readable label, detail, and time.
- The audit feed survives UI refresh while the local server is running.

## Epic 4 — Handle uncertainty safely

As a coordinator, I want an escalation path when verification is impossible so uncertainty never becomes an accidental release.

Acceptance:

- Staff can escalate a pending arrival to a guardian.
- Escalation marks the event as escalated and removes it from the pending queue.
- The UI confirms that nothing was released.

## Epic 5 — Make the decision defensible

As a coordinator, I want the release decision to include timing, source evidence, and a short explanation so another staff member can review it without guessing.

Acceptance:

- A correct claim code is blocked before the pickup window, after the pickup window, and after an already recorded release.
- A Ring arrival displays its source, device, event type, location, and event time.
- The decision record includes policy status, child, coordinator, decision time, and explanation mode.
- Amazon Bedrock can explain the already-computed policy result when enabled, while the local fallback remains usable without external credentials.

## Demo data and edge cases

- The first run starts with a pending Ring simulator arrival.
- A second simulator event can be created from the dashboard.
- A wrong code is a safe negative path.
- A missing selection or malformed code is blocked before the API call.
