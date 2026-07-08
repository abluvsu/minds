# WAVE 2 — OA-3 (KILO) Verification & Cross-Verification Plan

**Agent:** KILO · **Scope:** `frontend/src/renderer/cowork/views/SettingsView.jsx` (+ plumbing already done by OPENCODE in `settingsTransform.js`/`user_settings.py`/`settings.py`).
**Mode:** Plan (verification only — no source edits this session).

---

## 1. OA-3 Status: COMPLETE (verified)

The "Google Sign-In (one-time unlock)" panel is implemented and committed-ready in the working tree. Evidence:

| Criterion | Location | Verdict |
|---|---|---|
| (a) Collapsible section near Model Sources | `SettingsView.jsx` L1148 (before Model Sources L1205) | ✅ |
| (b) Client ID (text) + Client secret (password, masked) | `ClearableTextInput` L1183, `ApiKeyInput` L1194 | ✅ |
| (c) Save via existing path, keys `google_oauth_client_id`/`google_oauth_client_secret` | `setSetting(...)` L1185/L1196 → `updateSettings`→`diffSettingsForWrite` | ✅ |
| (d) 3-step how-to | L1154–1162 | ✅ |
| (e) Green "Unlocked" pill when both set | `googleUnlockActive` L840, pill L1164–1177 | ✅ |
| (f) "OAuth"/"token"/"scope" only in-section | grep: 0 user-visible leaks (see note) | ✅ |

**Typecheck:** `cd frontend && npx tsc --noEmit` → **EXIT 0** (clean).

**Plumbing that makes (c) actually persist** (done by OPENCODE, verified present):
- `settingsTransform.js` L27–28: `google_oauth_client_id`/`google_oauth_client_secret` added to `SETTINGS_KEY_MAP` (so `transformSettingsRows` no longer drops them and `diffSettingsForWrite` can map them).
- `user_settings.py` L129/L134: fields typed `SecretStr | None`; L296 `google_oauth_configured: bool` exposed in `config_status` (boolean only — no secret leak).
- `settings.py` L124: `google_oauth_client_secret` added to `reveal_key` `field_map` (so `ApiKeyInput` reveal works).

---

## 2. Requirement (f) note (non-blocking)

The only occurrences of `token` outside the section are **code comments**, not user-facing copy: L209 ("theme tokens"), L1014 ("refresh token"), L1740 ("token-driven"). Identifiers like `googleOAuthClientId` are JS variable names, not rendered. If the gate is interpreted strictly (zero textual occurrences anywhere), rephrase those 3 comments to remove "token". Recommended: leave as-is (intent = no user-facing leakage).

---

## 3. Remaining KILO action — Cross-verify OA-1 + OA-2 (Standing Order 3)

OA-3 is KILO's build; OA-1 (OPENCODE, backend `probe.py`/`oauth/config.py`/`app_settings.py`) and OA-2 (GEMINI-CTO, `DataVaultFormPanel.jsx`/`host.ts` reactive `_oauth_url`) must be independently cross-verified by KILO. KILO does **not** self-certify.

**Test: "unconfigured path" (no credentials)**
1. Boot the app (`cd frontend && npm run dev:web`, or `make dev`). Wait for `cowork-server` ready on :26866.
2. Open a Google connector's DataVault form (e.g. Gmail).
3. With **no** `google_oauth_client_id`/`secret` set (and the "Unlocked" pill absent), click the OAuth connect action.
4. **Expected:** server `probe.py` resolves empty client creds → `google_service.start()` raises 400 → probe catches → emits an error delta + `response.completed` status `failed`. Frontend shows a clear error overlay (NOT a hung "waiting" state, NOT a fake "server not running").
5. **Record raw:** the SSE error payload + what the overlay rendered (Standing Order 4 — paste, don't adjective).

**Test: "configured path" (optional, same OA-2 surface)**
6. Set Client ID + secret in the OA-3 Settings panel, Save.
7. Re-open the Gmail form, click connect → browser opens to Google → approve → card flips to Connected.

**Gate:** Both OA-1 and OA-2 cross-verified by KILO with raw output → wave ready for autonomous commit (Standing Order 5). If the unconfigured-path test fails twice, escalate to human (Standing Order 7).

---

## 4. Validation summary
- Frontend `npx tsc --noEmit`: 0 errors. ✅ (OA-3)
- Backend `cd backend/core_api && uv run pytest tests/ -q`: must stay green (run by KILO during OA-1 cross-verification). ⏳
- Manual OAuth flows: ⏳ (require running app — cannot run in this planning session).

## 5. Open questions
- Does the unconfigured-path error currently surface as an overlay, or only in console? (verified during step 4)
- Should the 3 "token" comments (L209/L1014/L1740) be rephrased to satisfy a strict reading of (f)?
