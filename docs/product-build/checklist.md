# PickupPass build checklist

- [x] **1. Create the runnable app shell**
  Verify: `npm start`, then open `http://localhost:4173`.
- [x] **2. Build the Ring arrival simulator and state API**
  Verify: `POST /api/ring/simulator/event` creates a pending event.
- [x] **3. Build the front-desk dashboard**
  Verify: pending arrival, roster, and recent activity are visible.
- [x] **4. Build the verification decision flow**
  Verify: `4829` for Maya approves; a wrong code rejects.
- [x] **5. Build the escalation path and audit feed**
  Verify: escalation removes the event from pending and adds a record.
- [x] **6. Wire a real Ring developer integration or recorded API fixture**
  Verify: `ring-client.js` calls the Ring Partner API, `/api/ring/webhook` verifies and deduplicates signed events, and the fixture path was exercised end to end.
- [x] **7. Add AWS Builder value without hiding the core workflow**
  Verify: Bedrock Converse explains an event or policy decision when enabled, with a visible local fallback and a deterministic policy authority.
- [x] **8. Prepare the under-three-minute demo flow and Devpost materials**
  Verify: `demo-script.md`, `product-feedback.md`, `friction-log.md`, README setup, and test data are complete. The final recording remains a manual capture step.
