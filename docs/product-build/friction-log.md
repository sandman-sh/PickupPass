# Setup and testing friction log

| Area | Friction | Severity | Workaround | Product suggestion |
| --- | --- | --- | --- | --- |
| Ring account | A live access token is not available in the local environment. | Medium | Use the normalized simulator event and signed webhook fixture. | Provide a first-run fixture pack in the developer portal. |
| Webhook testing | Signature verification is easy to get subtly wrong when payload bytes change. | Medium | Sign the exact raw request body and replay the same request id to test deduplication. | Add a portal button that emits a signed sample event. |
| Time policy | Human-readable windows may omit the meridiem on the first time. | High | Infer the first meridiem from the end of the same window and test boundary cases. | Publish a canonical time-window schema. |
| Bedrock | The explanation layer needs credentials and network access to exercise the live path. | Medium | Keep the policy result local and provide a visible fallback explanation. | Add a lightweight local model or official dry-run mode. |
| Submission capture | The strongest story requires both a positive and a negative outcome in a short recording. | Low | Use deterministic event clocks and a prepared script. | Add a one-click demo reset and scenario picker. |

## Current verification evidence

- The Ring adapter calls the live device endpoint when a bearer token is present.
- The webhook path verifies HMAC signatures when a secret is configured.
- Replayed request ids are ignored without duplicating the audit feed.
- Policy outcomes cover invalid code, too early, expired window, duplicate release, and approval.
- Bedrock fallback is available when `BEDROCK_ENABLED=false`.
