# One-Click Connectors — Simplification Plan

**Goal:** a non-coder connects Gmail, Google Ads, HubSpot, GA4, etc. by clicking
**Connect → Sign in → Approve**. No tokens, no cloud consoles, no docs.

**Ground truth (verified 2026-07-07):**
- 211 connector specs exist (`GET /api/v1/connectors/specs`), all ending in
  token/key-paste forms.
- Backend already has a working Google OAuth service
  (`cowork/services/connectors/oauth/`) with scope configs for
  **google-drive, google-calendar, gmail, google-ads, google-analytics** and a
  start/callback endpoint pair — gated on `GOOGLE_CLIENT_ID`/`SECRET` env vars.
- The Gmail spec contains a **hidden** `browser_oauth_builtin` method
  ("just click Connect") — hidden because no OAuth client is provisioned.
- Electron main already has an OAuth PKCE loopback (`src/main/oauth-service.ts`)
  used for Keycloak — reusable pattern.
- Frontend has MCP scaffolding (`src/main/mcp/`) not yet wired to chat turns;
  Claude Code harness has `supports_mcp=True`.

## The one honest constraint

"Just sign in" always requires an **OAuth app registered with the provider**.
Nobody escapes this; products just hide *who* registers it. Three strategies,
used together:

| Strategy | Covers | Trade-off |
|---|---|---|
| **A. Own OAuth app, one-time guided setup** | All Google services with ONE client (Gmail+Ads+GA4+Drive+Calendar+Sheets) | 10-min one-time wizard; free; tokens never leave the machine |
| **B. Managed aggregator (Composio/Nango free tier)** | Long tail: HubSpot, Slack, Notion, LinkedIn, Meta Ads… hundreds, zero console work | Third party holds OAuth app + brokers tokens; per-provider availability varies |
| **C. Remote MCP servers (Anthropic connector ecosystem)** | Anything with a hosted MCP server, for CLI-coworker turns | Only benefits Claude Code turns, not Anton/Hermes data-vault queries |

**Recommended default:** A for the Google family now (it's 80% built),
B for HubSpot + the long tail next, C opportunistically once MCP wiring lands.

## Target user journey (the yardstick every PR is measured against)

1. **Connect Apps** shows a "One-click" wall first: Gmail, Google Ads, GA4,
   Sheets, Drive, Calendar, HubSpot — big logos, one **Connect** button each.
   Everything else under "All connectors (advanced)".
2. Click Connect → browser opens provider sign-in → approve → tab closes
   itself → card flips to **Connected as you@gmail.com** with a green dot.
3. First-run only (strategy A): a 3-step guided wizard creates the Google
   OAuth client — deep links straight to the right console pages, copy-paste
   two values, done forever. Framed as "Unlock one-click Google" not "set up
   OAuth credentials".
4. Post-connect: verification ping runs automatically; card suggests a first
   prompt ("Summarize today's inbox", "How did my ads do this week?").
5. **Health center:** every connection shows expiry/status; a dead token shows
   **Reconnect** (one click, same flow) — never an error dump.

## Work packages (agent-assignable, dependency-ordered)

### WP-0 — Recon & contract (Explore agent, read-only, ~1h)
Map the existing OAuth flow end-to-end: `oauth.py` endpoints →
`google_service.start/callback` → where tokens are persisted → how
`connections.py`/data-vault consume them. Deliverable: sequence diagram +
the exact token storage shape. Blocks everything; do first.

### WP-1 — Google one-click, end to end (general-purpose agent, backend+frontend)
- Unhide `browser_oauth_builtin` when `OAuthSettings` has a client configured;
  surface "Sign in with Google" as the **recommended** method, demote
  token-paste to "Advanced".
- Wire the button: renderer → `POST /connectors/oauth/{service}/start` → open
  system browser → callback closes tab → poll connection status → flip card.
- One Google client covers all five services — connect flow must reuse the
  stored client for every Google connector.
- Acceptance: fresh machine + wizard-created client → Gmail AND Google Ads
  connected with zero pasted tokens; conversation can read inbox.

### WP-2 — First-run "Unlock Google" wizard (general-purpose agent, frontend-heavy)
3 steps, each with a deep link and a screenshot: create project → OAuth consent
(external, test mode) → create Desktop-app client → paste id+secret into the
wizard (stored via existing Fernet vault, not env vars — move `OAuthSettings`
to DB-backed settings). Acceptance: a non-technical user completes it in
<10 min following only in-app instructions.

### WP-3 — Aggregator spike: HubSpot via Composio/Nango (general-purpose agent, time-boxed 1 day)
Prove the managed path with ONE connector: HubSpot "Sign in" through the
aggregator's hosted OAuth, token retrieved server-side, stored in the same
vault, consumed by the existing hubspot engine. Decision gate: if the free
tier or token custody disappoints, fall back to per-provider native OAuth
(HubSpot public app) using the WP-1 pattern. Deliverable includes a written
go/no-go recommendation.

### WP-4 — Connection Broker abstraction (feature-dev:code-architect first, then general-purpose)
Only AFTER WP-1/WP-3 prove both strategies: extract the common shape —
`ConnectionMethod = builtin_oauth | aggregator | token_paste` per spec,
uniform status/refresh/revoke, auto-refresh on 401, health poller.
Architect agent designs against the two working implementations; implementer
refactors both onto the abstraction. (Deliberately not first — abstractions
extracted from one example are guesses.)

### WP-5 — Connect Apps UX overhaul (general-purpose agent, frontend)
One-click wall + advanced section, connected-state cards (account email,
scopes, last-used), Reconnect affordance, post-connect suggested prompts.
Design constraint: the word "OAuth", "token", "scope", or "client" must never
appear outside the Advanced section.

### WP-6 — MCP bridge for CLI coworkers (general-purpose agent, after WP-4)
Wire `src/main/mcp/` + `.minds/mcp/servers.json` into the real turn path:
connected accounts materialize as MCP servers for Claude Code turns
(`supports_mcp` finally consumed). Gives the CLI coworkers native tool access
to the same accounts without re-authing.

### WP-7 — Verification gate (code-review + pr-review-toolkit:silent-failure-hunter after every WP)
Each WP ends with: `/code-review` on the diff, silent-failure hunt on the
OAuth error paths (expired refresh token, revoked grant, closed browser tab,
double-click reconnect), and one scripted smoke: connect → query → revoke →
reconnect.

## Sequencing & effort

| Order | WP | Effort | Unblocks |
|---|---|---|---|
| 1 | WP-0 recon | hours | all |
| 2 | WP-1 Google e2e | 1–2 sessions | WP-2, WP-5 |
| 3 | WP-2 wizard | 1 session | non-coder reality |
| 4 | WP-3 HubSpot spike | 1 day box | WP-4 decision |
| 5 | WP-4 broker | 1–2 sessions | WP-5, WP-6 |
| 6 | WP-5 UX wall | 1 session | ship |
| 7 | WP-6 MCP bridge | 1 session | CLI-coworker tools |

## Risks / open decisions

- **Google consent screen in "test" mode** caps at 100 test users and shows an
  "unverified app" interstitial — fine for a personal hub; document the extra
  "Continue" click in the wizard.
- **Aggregator custody:** Composio/Nango see tokens. If unacceptable, strategy
  B becomes "native OAuth per provider, added one at a time" — slower but
  sovereign. This is the one genuine product decision to make at WP-3's gate.
- **Meta/LinkedIn Ads** native OAuth requires app review for production scopes
  — aggregator or dev-mode-only until reviewed.
- Token refresh on a machine that sleeps for weeks: refresh-on-use, not cron.
