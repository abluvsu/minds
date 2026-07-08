# Phase 3A: Domain Architecture Contracts

**STATUS:** LOCKED  
**GATE:** Phase 3A complete and frozen.

*No technology, no databases, no API protocols. This is the pure business model.*

---

## D1. Domain Map
The hierarchy of the business system.

```text
User
  ↓
AI Chief of Staff
  ↓
Work Item (The universal unit of execution)
  ├── Result (The finalized HTML/Markdown output)
  ├── Approval (The pending human decision)
  └── Memory (The context extracted from the execution)
  ↓
Knowledge (Connected data, docs, accounts)
  ↓
Inbox (The queue of user-attention events)
```

---

## D2. Aggregate Boundaries
Every object owns exactly one responsibility. No God objects.

* **`Work Item` owns:** Status, priority, history, approvals, outputs, ETA, confidence.
* **`Work Item` does NOT own:** Memory, user settings, authentication, knowledge retrieval logic.
* **`AI Chief of Staff` owns:** Planning, execution, autonomy mode decisions, tool selection.
* **`Inbox` owns:** Notification routing, read/unread state, priority queues.
* **`Result` owns:** HTML rendering payload, summary, export options.
* **`Knowledge` owns:** Connection status, embeddings, data freshness.

---

## D3. Business Events
Every state change emits an event. Technology stacks (Phase 3B) will decide how these are persisted (e.g., SQLite, Redis, IPC).

* `Work.Created`
* `Work.PlanningStarted`
* `Work.WorkingStarted`
* `Work.WaitingStarted`
* `Work.ApprovalRequested`
* `Work.ApprovalGranted`
* `Work.ApprovalRejected`
* `Work.Completed`
* `Work.Archived`
* `Work.RevisionRequested`
* `Inbox.ItemAdded`
* `Inbox.ItemCleared`
* `Memory.Updated`

---

## D4. Business Rules
Strict invariants that cannot be violated by any technical implementation.

1. A `Completed` work item cannot return to `Planning`.
2. A `Rejected` approval permanently halts the `Work Item` until a `RevisionRequested` event occurs.
3. Only the `User` can emit `ApprovalGranted`. The AI cannot self-approve a blocked item.
4. A `Work Item` in `Working` state MUST emit a `Progress` event at least every 60 seconds (prevents silent hanging).
5. A `RevisionRequested` event must clone the `Work Item` into a new version. The old version becomes read-only history.
6. The `Inbox` cannot contain notifications for `Completed` work. Those belong in the Executive Briefing.

---

## D5. State Transition Matrix
Executable documentation defining legal state changes for a Work Item.

| Current State | Event | Next State | Allowed? |
| :--- | :--- | :--- | :---: |
| `Created` | `StartPlanning` | `Planning` | **Yes** |
| `Planning` | `StartWorking` | `Working` | **Yes** |
| `Working` | `PauseForApproval` | `Approval` | **Yes** |
| `Working` | `PauseForWait` | `Waiting` | **Yes** |
| `Waiting` | `Unblock` | `Working` | **Yes** |
| `Approval` | `Approve` | `Working` | **Yes** |
| `Approval` | `Reject` | `Waiting` | **Yes** |
| `Working` | `Finish` | `Completed` | **Yes** |
| `Completed` | `Archive` | `Archived` | **Yes** |
| `Completed` | `StartWorking` | `Working` | **NO** |
| `Archived` | `Edit` | `Revision` | **NO** |

---

## D6. Ownership Matrix
Every field has exactly one system owner. 

| Field / Attribute | Owner / Mutator |
| :--- | :--- |
| **Priority** | `AI Planner` (Determined at creation) |
| **Status** | `Work Item Lifecycle Manager` |
| **AI Confidence** | `AI Execution Engine` |
| **ETA** | `AI Planner` |
| **Outputs / HTML** | `Result Generator` |
| **Knowledge Used** | `Knowledge Retrieval Engine` |
| **Approval Decision** | `User` (via Inbox) |

---

## WORK ITEM CONTRACT
*The master contract for the core domain object.*

* **Owner:** Domain Architect (Team M)
* **Purpose:** The universal container for all delegated intent.
* **Lifecycle:** Managed by the State Transition Matrix (D5).
* **Inputs:** User Intent (string), Knowledge Context (array), Autonomy Mode (enum).
* **Outputs:** Result (HTML/Markdown payload).
* **Dependencies:** None. (Knowledge and Memory depend on Work Items, not vice versa).
* **Events Emitted:** All `Work.*` events.
* **Permissions:** Read-only to AI when in `Approval` state. Writable by User.
* **Constraints:** Must not exceed 1MB of raw text history. Must contain a valid ETA if in `Working` state.
* **Version:** 1.0.0
* **Consumers:** UI Home Screen, UI Inbox, AI Execution Engine, Result Renderer.

---

### Request for Architecture Governance Board Approval
If the Chief Architect, Domain Architect, Product Council, Trust Team, and User Advocate agree that these contracts perfectly map the frozen product vision into a technology-agnostic business domain, we request authorization to **LOCK Phase 3A (Gate C)** and open **Phase 3B (Technical Architecture)**.
