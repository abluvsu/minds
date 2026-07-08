# Wave 2 Architecture — Two-Agent Plan

Date: 2026-07-08

Goal: Two agents, zero file overlap. Clear scope, isolation, and cross-verification rules so Wave 2 proceeds safely.

Agents & Scope
- GEMINI-CTO — Backend Python + build scripts
  - Candidates: A1 `session` context manager, A2 `TTLCache`, A3 health response model, A4 Windows build abstraction
- KILO — Frontend React
  - Candidates: B1 `useBrowserOAuth` hook extraction

Safety mechanisms (mandatory)
1. Isolation — strict file ownership: backend Python files belong only to GEMINI-CTO; frontend React files belong only to KILO. No overlapping file edits.
2. One commit per candidate — each candidate is a single, reviewable change. Reverts only affect one candidate.
3. Test surface = interface
   - `open_session()` context manager exercised via existing integration tests.
   - `TTLCache` behavior validated through the `/health` endpoint tests.
   - `useBrowserOAuth` validated with `npx tsc --noEmit` plus a manual OAuth smoke flow.
4. Cross-verification — no self-certification
   - GEMINI-CTO runs KILO's manual OAuth verification (observes frontend behavior).
   - KILO runs GEMINI-CTO's pytest suite (`uv run pytest tests/ -q`) and reports raw tails.
5. Incremental ordering (enforced):
   - A1 (session ctx manager)
   - A2 (TTLCache)
   - A4 (build Windows abstraction)
   - A3 (health wire-format) — backend wire-format change last so frontend doesn't adapt mid-wave
   - B1 (OAuth hook extraction)

Acceptance & artifacts
- Each candidate must append an EDIT JOURNAL entry in `.minds/war_room.md` with raw test output per Standing Order 4.
- Each candidate must include the exact commands used to verify and the last ~50 lines of raw output.

Coordination notes
- If any agent needs to touch a file outside their scope, they must append a `BLOCKED` journal entry and request reassignment.
- Keep changes minimal and reversible. Prefer feature flags and runtime guards for behavior changes.

Next steps
- GEMINI-CTO: implement A1 and append journal entry with pytest/integration evidence.
- KILO: prepare B1 design + `tsc --noEmit` verification; hold until backend A3 wire-format is finalized.
# WAVE 2 — Architecture improvements

> **Phase:** Planning
> **Branch:** `feat/architecture-wave2` (create from `main` or current wave branch)
> **Agents:** GEMINI-CTO (Agent A), KILO (Agent B)
> **Cross-verification:** Agent A verifies Agent B's output, Agent B verifies Agent A's output
> **Commit policy:** Autonomous commit allowed after cross-verified gate

---

## FILE OWNERSHIP

| File | Owner | Notes |
|---|---|---|
| `backend/core_api/cowork/db/session.py` | AGENT A | Not locked in any prior wave |
| `backend/core_api/cowork/common/settings/user_settings.py` | AGENT A | Previously OPENCODE — reassigned to GEMINI-CTO for this wave |
| `backend/core_api/cowork/common/settings/app_settings.py` | AGENT A | Adjacent to user_settings.py |
| `backend/core_api/cowork/api/v1/endpoints/health.py` | AGENT A | Backend endpoint |
| `backend/core_api/tests/*` | AGENT A | All tests |
| `scripts/app-win.sh` | AGENT A | Previously OPENCODE — reassigned |
| `frontend/src/renderer/cowork/components/datavault/DataVaultFormPanel.jsx` | AGENT B | KILO territory per Wave 1 |
| `frontend/src/renderer/cowork/hooks/` | AGENT B | New file — KILO creates |
| `.minds/war_room.md` | BOTH | Append journal only |
| `.minds/wave2-architecture.md` | BOTH | This file — read on start |

---

## AGENT A (GEMINI-CTO) — BACKEND IMPROVEMENTS

### Scope (in order, do NOT skip ahead)

#### A1. Session lifecycle — context manager

**Files:**
- `backend/core_api/cowork/db/session.py`
- All 9+ call sites that use `get_open_session()`

**Change:**
1. Add `open_session()` context manager that auto-closes on `__exit__`
2. Keep `get_open_session()` but mark it `@deprecated("use open_session() context manager")`
3. Migrate known call sites — find ALL with `rg "get_open_session\(\)"` first
4. Add `pool_size=1, max_overflow=0` for SQLite engine config

**Call sites to migrate:**
```
backend/core_api/cowork/common/settings/user_settings.py
backend/core_api/cowork/channels/runtime.py
backend/core_api/tests/*
backend/core_api/cowork/services/*
backend/core_api/cowork/api/v1/endpoints/*
```
Search comprehensively — do not trust this list to be exhaustive.

**Verification:**
```
cd backend/core_api && uv run pytest tests/ -q
```
All existing tests must pass. No new warnings about session cleanup.

**Gate:**
- [ ] All call sites migrated (grep shows 0 remaining occurrences of `get_open_session(` in non-deprecated code)
- [ ] `uv run pytest tests/ -q` — all pass

---

#### A2. Settings cache — unify behind TTLCache

**Files:**
- `backend/core_api/cowork/common/settings/cache.py` (NEW — shared TTLCache module)
- `backend/core_api/cowork/common/settings/user_settings.py`
- `backend/core_api/cowork/common/settings/app_settings.py`

**Change:**
1. Create `cowork/common/settings/cache.py` with:
   - Thread-safe `TTLCache` class (use `cachetools.TTLCache` or `threading.Lock` + dict)
   - Default TTL: 60s for config_status, 300s for build stamp, infinite for app_settings
   - `invalidate(key)` method
   - All exceptions logged via `logger.warning()` — no bare `except: pass`
2. Replace `_config_status_cache`/`_config_status_cache_at` globals with the shared cache
3. Replace `@lru_cache` on `get_app_settings()` with the same pattern (or keep if simpler — make a judgement call)
4. Replace all three bare `except Exception: pass` with `logger.warning()`
5. Move deferred imports to top-level — if circular imports prevent this, document in an inline comment which module causes the cycle

**Verification:**
```
cd backend/core_api && uv run pytest tests/ -q
```

**Gate:**
- [ ] All existing tests pass
- [ ] No bare `except Exception: pass` remains in `user_settings.py` (search with `rg "except\s+Exception"`)
- [ ] Cache module has `invalidate()` — confirmed no caller lacks it

---

#### A3. Health endpoint response model

**File:**
- `backend/core_api/cowork/api/v1/endpoints/health.py`

**Change:**
1. Define `HealthResponse` Pydantic model with explicit fields: `status`, `anton_available`, `mode`, `server_version`, `anton_version`, `config_status: dict | None`
2. Annotate endpoint `response_model=HealthResponse`
3. Nest `config_status` as a sub-key instead of `**spread`

**Verification:**
- `curl http://127.0.0.1:26866/health` returns valid JSON matching the model
- OpenAPI schema at `/docs` shows the correct response model

**Gate:**
- [ ] `curl /health` returns predictable shape
- [ ] Frontend `HomeOS.tsx` reads `config_ready` and `config_error` at the same depth (may need to update path if nesting changed)

---

#### A4. Build pipeline Windows abstraction

**File:**
- `scripts/app-win.sh`

**Change:**
1. Add `timeout` detection and fallback:
   ```bash
   if command -v timeout &> /dev/null; then
     TIMEOUT="timeout 600"
   else
     TIMEOUT=""
   fi
   ```
2. Add `cygpath` detection with `wslpath` and `sed` fallbacks
3. Replace `Stop-Process -Force` with a PID-file based approach:
   - Write PID to `~/.cowork/server.pid` on start
   - On shutdown, read the PID and target only that process
   - Fallback: `taskkill /PID <pid>` instead of `Stop-Process -Force`

**Gate:**
- [ ] Script runs without errors on Git Bash
- [ ] No hard dependency on `cygpath` or `timeout` (both have fallbacks)
- [ ] PID-based kill targets only the correct process

---

## AGENT B (KILO) — FRONTEND OAUTH POLLING

### Scope

#### B1. Extract `useBrowserOAuth` hook

**Files:**
- `frontend/src/renderer/cowork/hooks/useBrowserOAuth.ts` (NEW)
- `frontend/src/renderer/cowork/components/datavault/DataVaultFormPanel.jsx`

**Change:**
1. Create a `useBrowserOAuth` hook with this interface:

```typescript
interface UseBrowserOAuthOptions {
  onSuccess: (result: { engine: string; values: any }) => void;
  onError: (error: string) => void;
}

interface UseBrowserOAuthReturn {
  startPolling: (authUrl: string) => void;
  stopPolling: () => void;
  isPolling: boolean;
}
```

2. The hook MUST:
   - Track the `setInterval` handle in a `useRef`
   - Clear the interval in a `useEffect` cleanup (component unmount safety)
   - Attempt to close the popup (`popup.close()`) on success
   - Guard against re-entrance (ignore duplicate `startPolling` calls while already polling)
   - Use the same polling interval and success detection as the original code

3. In `DataVaultFormPanel.jsx`:
   - Call the hook at the top of the component
   - Replace both polling blocks (lines 250–291 and 771–816) with `startPolling(url)`
   - Add `if (busy) return;` guard at the top of `handleAction`
   - Remove the duplicate ~65 lines

**Safety — do NOT change:**
- The OAuth popup URL construction
- The success/failure detection logic
- The form patching mechanism
- The component's external props/interface

**Verification:**
```
cd frontend && npx tsc --noEmit
```

**Manual verification (performed by AGENT A after commit):**
1. Navigate to the DataVault form in the running app
2. Select a browser OAuth integration
3. Verify OAuth popup opens
4. Complete OAuth in the popup
5. Verify polling detects success, popup auto-closes
6. Navigate away mid-polling — verify no console errors about state updates on unmounted component

**Gate:**
- [ ] `npx tsc --noEmit` passes (0 errors)
- [ ] Original polling logic is preserved (same URL, same success check, same polling interval)
- [ ] No orphaned intervals on unmount (verified by AGENT A's manual test)
- [ ] No UI regression in DataVault OAuth flow

---

## SAFETY PLAN

### Isolation guarantees

1. **No shared files between agents.** Agent A touches backend Python + scripts. Agent B touches frontend React. Zero overlap.

2. **One commit per candidate.** Each of A1–A4 is a separate atomic commit. B1 is a separate atomic commit. If any candidate breaks something, revert one commit, not the whole wave.

3. **Test surface is the interface, not internals.** The TTLCache module is tested through the existing health endpoint and settings tests. The session context manager is tested through existing integration tests. The OAuth hook is tested through `tsc --noEmit` and manual OAuth flow.

### Rollback plan

| Candidate | Revert command |
|---|---|
| A1 | `git revert <commit> -m "revert: session context manager"` |
| A2 | `git revert <commit>` |
| A3 | `git revert <commit>` |
| A4 | `git revert <commit>` |
| B1 | `git revert <commit>` |

### Incremental deploy ordering

```
A1 → A2 → A4 → A3 → B1
```

Reasons:
- A1 first because session leaks are the most impactful bug
- A2 next because TTLCache enables the A3 health model
- A4 (build) is isolated, can land any time
- A3 last on backend because it changes the health response wire format
- B1 last because it touches the frontend — no backend dependency

---

## CROSS-VERIFICATION ASSIGNMENTS

| Written by | Verified by | What to verify |
|---|---|---|
| Agent A (A1–A4) | Agent B | All `uv run pytest tests/ -q` pass |
| Agent A (A3) | Agent B | `curl /health` shape matches documented `HealthResponse` model |
| Agent A (A4) | Agent B | `scripts/app-win.sh` runs without errors (inspect, don't exec) |
| Agent B (B1) | Agent A | Manual OAuth flow in running app — popup opens, completes, auto-closes |
| Agent B (B1) | Agent A | Navigate away mid-polling, check DevTools console for no orphaned-interval errors |

---

## APPENDIX: Interface contracts

### HealthResponse model (for Agent B's reference)

```python
class HealthResponse(BaseModel):
    status: str          # "ok"
    anton_available: bool
    mode: str
    server_version: str
    anton_version: str
    config_status: dict | None   # nested, not spread
```

### useBrowserOAuth hook (for Agent A's reference when verifying)

```typescript
interface UseBrowserOAuthReturn {
  startPolling: (authUrl: string) => void;
  stopPolling: () => void;
  isPolling: boolean;
}
```
Read `DataVaultFormPanel.jsx` to verify the usage matches.
