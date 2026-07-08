# Phase 3B: Technical Architecture Plan (Revision 2)

**STATUS:** OPEN FOR DEVELOPMENT  
**GATE:** Awaiting Working Demo to LOCK Phase 3B (Gate D). *Note: Header edits do not lock phases. Only a passing `make smoke` and functional demo locks this gate.*

## T1: Live Audit Diff Report (Stale Assumptions vs Reality)
Before continuing, we ran an audit against the live repository (`feat/cli-agent-platform` branch semantics). Here are the corrected assumptions:

1. **React 19:** Assumption was that we need to upgrade. Reality: The repo is ALREADY on React 19 (`@types/react: ^19.0.0`).
2. **Channel/Provider Deprecation:** Assumption was to rip them out. Reality: Providers are already replaced by Model Sources + CLI coworkers. Channels are the live WhatsApp surface. Blanket deprecation conflicts with in-flight work. **Correction:** Do not gut Channels/Providers.
3. **Data Layer Rename:** Assumption was to rename DB tables from `conversations` to `work_items`. Reality: This offers zero user value and breaks the working backend. **Correction:** Keep `conversations` and `artifacts` in the DB/API. Map them to "Work Items" and "Results" purely at the UI label layer (T4).
4. **Trust Timeline / Tail API:** Assumption was the tail API is broken/missing infra. Reality: `/responses/tail?from_seq=` and `message_events` exist. The real gap is write-ahead ordering and replay completeness. **Correction:** Harden the existing pipe.
5. **UI Rewrite:** Assumption was to gut `ChatView.jsx`. Reality: `ChatView.jsx` contains years of edge-case armor (stream reattach, zombie reconcile, etc). **Correction:** Use the Strangler pattern.

---

## Technical Directives (The Execution Plan)

### Directive 1: Event Write-Ahead & Replay (T2 & T3)
* **Goal:** A user can close their laptop mid-turn, reopen it, and see full progress.
* **Backend (`general-purpose`):** Persist event states to `message_events` *before* emitting them to the SSE stream. 
* **Backend (`general-purpose`):** Ensure `/responses/tail?from_seq=` fully replays buffered/missed events from the DB based on the sequence number before resuming live tailing.
* **Test (`test agent`):** Write an E2E test proving a mid-turn disconnect/reconnect loses zero events.

### Directive 2: Deploy-Skew & Smoke Gates (T6 & T7)
* **Goal:** Eliminate the #1 failure mode (stale renderer shipped in packaged exe).
* **Makefile (`general-purpose`):** Implement `make app-win` (a single build-package-install target for Windows).
* **Settings UI:** Inject a build stamp (commit hash + timestamp) visible in the Settings screen.
* **Makefile (`general-purpose`):** Implement `make smoke` (boots the app, runs 1 turn per coworker, asserts connector list). **Phases cannot be locked until this passes.**

### Directive 3: The UI Strangler Pattern (T5)
* **Goal:** Introduce the `HomeOS` without destroying the battle-tested `ChatView.jsx`.
* **Frontend (`general-purpose`):** Mount ONE new component (e.g., the Home Hero or AI Inbox) *inside* the existing routing structure. 
* **Rule:** Old `ChatView` remains untouched. Both render concurrently during the transition. The old path is only deletable after 2 weeks of real use.

### Directive 4: UI Label Map (T4)
* **Frontend (`general-purpose`):** Implement a localization/label map that replaces "Conversation" with "Work Item" and "Artifact" with "Result" across the UI, requiring zero schema or API changes. Revertable in 1 commit.

---

## Execution Order
1. **T1:** (Completed - This Audit)
2. **T2 + T3:** Hardening the SSE tail replay and proving it.
3. **T6 + T7:** Implementing `make app-win` and `make smoke`.
4. **T5:** Strangler slice 1 (HomeOS hero component).
5. **T8:** Code review and silent-failure hunt on T2 error paths.

**Exit Criteria:** A working demo of the Strangler UI component and a passing `make smoke` run.
