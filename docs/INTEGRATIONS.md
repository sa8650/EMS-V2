# Integrations

## Connect App (SMS gateway pairing)

EMS has no public API keys. Other applications — notably the ConnectX Android app that sends SMS from a shop phone — connect through **Connect App**, a signed app-to-app protocol (`connect-app/1`).

- Endpoint: `https://<your-domain>/connect` (`GET` returns the public identity; `POST` receives signed envelopes). The URL is unchanged from EMS 4.x, so paired apps keep working after the address moves to the new deployment.
- Pairing: Owner console → Connect App → paste the other app's Connect Endpoint → send the request → match the pairing code in the other app. Inbound requests appear for approval. Each connection stores its id (`CXN-…`), the remote application id and endpoint, a shared secret and permissions (`sms:send`).
- Envelopes are HMAC-signed over the action, ids, timestamp, nonce and payload hash; timestamps older than 10 minutes and unsigned or mis-signed envelopes are rejected.
- SMS flow: a shop SMS gets a request id (`SMS-10001`), is queued (`queued`), relayed to the active connection (`sending`), and the phone reports the result (`SUCCESS`/`FAILED` → `sent`/`failed`). The protocol keeps its uppercase statuses and 4.x field names (`message_body`, `error_message`) on the wire.

## ConnectX (email and SMS for shops)

- Email goes through **Brevo** (`BREVO_API_KEY`); the sender (name, verified address, reply-to) and a platform-wide daily limit are set in Owner console → ConnectX. Shops send email to customers, suppliers or typed addresses and can attach an invoice, return or exchange slip.
- SMS goes through the paired Connect App. Shops choose automatic messages (after a sale, due payment, return, refund, exchange) and edit templates with `{name} {shop} {invoice} {total} {paid} {due} {amount}`.
- Email and SMS together count against the shop's ConnectX allowance per day (licence or add-on).

## AI (Zudo AI and AI Business Health)

- The owner chooses the model per service (Owner console → AI settings). Cloudflare models (`@cf/…`) use the Workers AI binding `AI`; other providers need their key as a server secret: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`.
- Zudo answers questions from a snapshot of the shop's own records (read-only). Customer phone numbers, emails and addresses are not sent to the provider; names and totals are.
- Business Health computes the score and findings with fixed rules (carried over from 4.x) and asks the model for written advice.
- Limits: per shop per day from the add-on allowance, plus an optional platform-wide daily limit.

## Vaultium (files)

- Files are stored in the R2 bucket bound as `FILES` under `vaultium/<admin>/<shop>/…`, linked to an invoice or expense if wanted. Up to 5 files per record, 5 MB each, no video; storage per administrator is limited by the Vaultium allowance (GB).
- Downloads are served by `/api/files/<id>` to signed-in users of that shop with the Vaultium view permission.

## App Store (Android apps)

- The owner publishes apps (Owner console → App Store) with an APK uploaded to R2 (`apps/<package>/…`) or an external HTTPS link, plus an optional icon.
- Public API used by installed apps (URLs unchanged from 4.x):
  - `GET /api/app-store/apps` — published apps with download links
  - `GET /api/app-store/check-update?package=<name>&versionCode=<n>` — `{ ok, hasUpdate, latestVersion, versionCode, mandatory, downloadUrl, releaseNotes, … }`
  - `GET|HEAD /api/app-store/download/<package>` — the APK (or a redirect to the external link)
  - `GET /api/app-store/file/<key>` — app icons

## TrueBill (document verification)

Invoices, returns and exchanges carry a QR code when TrueBill is active. It opens `/verify/<token>`, which confirms the document with minimal details and records the scan (Owner console → TrueBill scans).
