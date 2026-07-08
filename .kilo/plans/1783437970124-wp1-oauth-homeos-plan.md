# WP-1 Connector OAuth + HomeOS (T5) — Implementation Plan

**Status:** WP-1 *server* side (probe branch, status endpoint, settings, specs) is **already
implemented** in the tree (verified). The remaining work is a **frontend routing bug** that makes
the new server-driven OAuth flow unreachable for gmail, plus T5 (mount HomeOS) and the real
Google-client acceptance test. T6/T7 (smoke) and T8 (gate) are in flight.

**Scope guard:** No commits, no touching T2/T3 or T6/T7 files, full backend pytest must stay green.

---

## 1. Verified current state

| Area | Location | State |
|---|---|---|
| OAuth probe branch | `backend/core_api/cowork/handlers/probe.py` L130–166 | **Done.** Emits `oauth_launch` patch `{auth_url, service}` + `response.completed` status `oauth_pending`. Resolves client_id/secret from BYO values or `user_settings`. Does **not** save to vault (callback does). |
| Status endpoint | `backend/core_api/cowork/api/v1/endpoints/connectors/oauth.py` L29–51 | **Done.** `GET /{service}/status` → `{pending, connected, connection_name, error}`. |
| Connection name store | `backend/core_api/cowork/services/connectors/oauth/state.py` L53–66 | **Done.** `clear_pending(..., connection_name=)` stores `connectionName`. |
| Callback save | `backend/core_api/cowork/services/connectors/oauth/google.py` L177 | **Done.** Passes `connection_name`, saves to vault. |
| Settings fields | `backend/core_api/cowork/common/settings/user_settings.py` L108/113 | **Done.** `google_oauth_client_id`, `google_oauth_secret` (SecretStr). |
| Specs | `specs/{gmail,google_ads,google_analytics_4,google_calendar,google_drive}.json` | **Done.** `browser_oauth_builtin` method has `submit_action:"oauth_launch"`, `hidden:false`. |
| FE SSE consumer | `DataVaultFormPanel.jsx` L130–182 | **Done & correct.** On `spec.oauth_launch` (+`_is_probing`): `host.openExternal(auth_url)`, polls `pollOAuthStatus(service)`, flips card to Connected. |
| FE SSE relay | `App.jsx` L2885–2893 | **Done.** Relays `patch.oauth_launch` into form spec on `oauth_pending`. |
| `pollOAuthStatus` | `api.js` L1355 | **Done.** `GET /connectors/oauth/{service}/status`. |
| HomeOS prototype | `frontend/src/renderer/cowork/prototype/HomeOS.tsx` | **Done, NOT mounted.** |

---

## 2. The root bug (T1) — gmail never reaches the new flow

`DataVaultFormPanel.jsx` `handleAction` has **three** client OAuth paths, mutually gated by
`authMethod` / `submit_action`:

- **Path A — L243:** `authMethod === 'browser_oauth_builtin' && kind==='primary'`. Calls
  `startGmailAuth()` → `POST /integrations/gmail/oauth/start` → `oauth.py start_oauth` builds
  `OAuthSettings()` with **no** client creds → `google_service.start()` raises 400 unless
  *server-level* Google creds exist. Then `window.open` + poll `fetchIntegrations()`. **`return`s
  at L284**, so the streaming/submit path is never taken.
- **Path B — L308:** `activeMethodSpec.submit_action==='oauth_launch'`. Web → `startConnectorOAuth`
  + `pollConnectorOAuth`; Electron → `host.oauthConnect` PKCE + `saveConnector`. A *separate*
  OAuth flow from the SSE one.
- **SSE path — L130 `useEffect`:** driven by `probe.py`'s `oauth_launch` patch (only emitted when
  the **streaming submission** triggers `ProbeHandler`).

**For gmail (`authMethod=browser_oauth_builtin`, `submit_action=oauth_launch`):** Submit hits Path A,
returns early → the streaming submit (L510–565 `onSubmit`) is **skipped** → `probe.py` never runs →
SSE `oauth_launch` never emits → `useEffect` L130 never fires. The new server flow is **dead** for
gmail, and Path A is stale (server `OAuthSettings()` has no user creds; also confirm the
`/integrations/{service}/oauth/start` route still matches `oauth.py` — suspected 404/400).

### T1 — Fix: make the SSE/probe path the single source for `oauth_launch` methods

In `DataVaultFormPanel.jsx` `handleAction`:

1. Compute once: `const isOauthLaunch = activeMethodSpec?.submit_action === 'oauth_launch';`
2. Guard Path A (L243):
   `if (authMethod === 'browser_oauth_builtin' && !isOauthLaunch && kind === 'primary') { … }`
3. Guard Path B (L308):
   `if (!isOauthLaunch && activeMethodSpec?.submit_action === 'oauth_launch' && kind === 'primary') { … }`
   (With `isOauthLaunch` true this is dead for oauth_launch methods — intended; SSE path owns it.)
4. Result: for gmail, execution falls through L243 (skipped) and L308 (skipped) to the **generic
   streaming submit** L510–565 (`onSubmit`), which posts `method: 'browser_oauth_builtin'`. Server
   `probe.py` sees `submit_action==='oauth_launch'` → emits `oauth_launch` + `oauth_pending` →
   `App.jsx` relays → `useEffect` L130 opens browser + polls `pollOAuthStatus` → flips card.

**Confirmed root cause (evidence):** `startGmailAuth()` → `POST /integrations/gmail/oauth/start`
is served by the **compat stub** `compat/stubs.py` L32–34, which returns
`{"url": None, "error": "OAuth not yet available in cowork-server"}` (no `authUrl`). `DataVaultFormPanel.jsx`
L251–252 then does `if (!result?.authUrl) throw new Error('Could not start Google sign-in…')`.
**So gmail submit is currently broken** — Path A throws a fake "server not running" error and never
opens a browser. The only working flow (`probe.py` oauth_launch` + SSE `useEffect`) is unreachable
because Path A `return`s early before the streaming submit. Fixing T1 is the critical blocker.

`BROWSER_OAUTH_START` map + the `start*Auth` helpers become unused for `oauth_launch` methods — leave
them (cleanup later), but they must no longer run for those methods.

**Edge cases to test:**
- No client configured in Settings → `probe.py` resolves empty id/secret → `google_service.start`
  raises 400 → `probe.py` L162 catches → emits error + `response.completed` `failed`. Frontend must
  surface the error (not hang). Verify the failed branch.
- BYO client_id/secret in form fields → `probe.py` uses them.
- Timeout: `useEffect` MAX_POLLS 90 × 2s = 180s; server pending expires at 20 min — safe.
- Exactly ONE browser tab (`host.openExternal` once), no double vault write.

**Acceptance:** Submitting gmail opens one tab; on Google approval the card flips to Connected via
`pollOAuthStatus` (no second popup, no Path A/Path B execution).

---

## 3. T2 — T5: mount HomeOS (only real new coding)
Mount `prototype/HomeOS.tsx` inside an **existing route** behind a feature flag / route param. **Do
NOT replace** `ChatView.jsx` / `App.jsx`. Old home and new HomeOS both reachable.
**Acceptance:** flag on → HomeOS renders on home route; flag off → current home unchanged. Zero
regression to send / composer / model-picker flows already shipped.

## 4. T3 — WP-1 real acceptance test (gating; needs a real Google client)
Backend can't be runtime-verified without a real OAuth client (only you can provision it):
1. Create a Google Cloud OAuth client; redirect URI `{server_origin}/api/v1/connectors/oauth/gmail/callback`.
2. Put `client_id` / `client_secret` in Settings (`google_oauth_client_id` / `google_oauth_client_secret`).
3. `POST /connectors/submissions/` `method=browser_oauth_builtin` on `gmail` → SSE emits `auth_url`.
4. Approve in browser → `GET /connectors/oauth/gmail/status` → `connected:true` + real account email.
**Acceptance:** paste the real SSE `auth_url` emission + status JSON `connected:true`.

## 5. T4 — Test + gate (in flight)
- `T6/T7`: deliver verified `make smoke` output (full tail). **Gate D lock rejected until smoke is green** — not a header edit.
- `T8`: review gate runs only after T2/T3 (event hardening) and T6/T7 diffs + smoke settle. Scope: `probe.py`, `oauth.py`, `DataVaultFormPanel.jsx`, specs, `user_settings.py`, `HomeOS.tsx`.
- **Re-confirm pytest:** run `uv run pytest tests/ -q` from `backend/core_api`, attach tail (must stay 58+ green — the "58 green" predates current `probe.py`/`oauth.py`).

---

## 6. Open questions for dev-team discussion
1. **RESOLVED (recommend SSE/probe single-source).** Confirm Path A + Path B are disabled for
   `oauth_launch` methods (T1). *Alternative considered:* keep Path B (client PKCE) as source and
   delete the SSE `useEffect` — rejected because server is the authority on `auth_url` + vault save,
   and the new `probe.py`/`oauth.py`/`user_settings` wiring already assumes the server-driven model.
2. **HomeOS flag mechanism:** env var vs runtime config vs route param? (Recommend route param +
   env default-off for safe rollout.)
3. **T4 (label map):** still blocked on T5 slice — confirm it stays parked until T2 lands.

## 7. Risks
- **Confirmed:** gmail submit currently hits the broken compat stub (throws "Could not start Google
  sign-in"). The new server flow is the only viable path; T1 must route gmail to streaming.
- **Secondary check after T1:** once gmail reaches the streaming submit, also confirm Path B (L308
  `submit_action==='oauth_launch'` branch) is disabled for it, else L308's `startConnectorOAuth`/
  `host.oauthConnect` would run *in addition to* the SSE `useEffect` (double flow). The T1 guards
  (`!isOauthLaunch` on both L243 and L308) prevent this.
- `oauth_status` uses `OAuthStateStore._load()` (private) — works, note for cleanup.
- Isolated-worktree subagent spawns burned tokens before; resume in-place only.

## 8. Validation summary
- Backend: `uv run pytest tests/ -q` from `backend/core_api` → 58+ green.
- Frontend: manual gmail OAuth via real Google client → `connected:true` with real email; single tab.
- T5: flag on/off both render correctly, no regression to composer/model-picker.
- T6/T7: `make smoke` green tail attached before Gate D.
