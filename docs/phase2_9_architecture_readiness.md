# Phase 2.9: Architecture Readiness Review

**STATUS:** LOCKED  
**GATE:** Phase 2.9 complete and frozen.

This phase acts as the final "Design Freeze Validation" to catch structural system-design issues before a single API contract or database schema is drafted.

---

## 1. Canonical Work Item Specification

There is exactly one universal unit of execution in this system: **The Work Item**.
Whether it is an email draft, a recurring data pull, a research sprint, or an interactive dashboard, it maps to this schema.

```json
{
  "id": "uuid",
  "title": "string",
  "intent": "string (User's original prompt)",
  "status": "enum (Created, Planning, Working, Waiting, Approval, Completed, Archived)",
  "priority": "enum (Critical, High, Medium, Low)",
  "confidence_score": "float (0.0 to 1.0)",
  "eta": "timestamp (Estimated completion)",
  "progress": [
    { "timestamp": "ISO", "message": "string", "cost_delta": "float" }
  ],
  "dependencies": ["work_item_ids"],
  "approvals_required": [
    { "type": "enum (Send, Pay, Delete, Publish)", "status": "Pending|Approved|Rejected" }
  ],
  "knowledge_used": ["knowledge_ids"],
  "outputs": {
    "type": "enum (HTML, Document, Dashboard)",
    "content_uri": "string"
  },
  "revisions": ["work_item_ids (pointers to older versions)"]
}
```

---

## 2. Frozen Work State Machine

No extra states. No shortcuts. Every Work Item follows this deterministic flow.

```text
Created      : The user intent is logged.
  ↓
Planning     : AI is silently breaking intent into execution steps.
  ↓
Working      : AI is actively executing. (ETA and Cost incrementing).
  ↓
Waiting      : AI is asleep, waiting for an external trigger (email reply, scheduled time).
  ↓
Approval     : Halted. Awaiting user YES/NO in the AI Inbox. (Priority: High).
  ↓
Publishing   : Executing the approved high-risk action.
  ↓
Completed    : Work is finished. HTML result generated. Digested into Executive Briefing.
  ↓
Archived     : Pushed to Results history. Context pushed to long-term Memory.
```

---

## 3. Domain Language Specification

This is the dictionary for the entire company. No other terms may be used in code, UI, or docs.

| User / UI Says | Product / Backend Says | 🚫 NEVER SAY (Banned Terms) |
| :--- | :--- | :--- |
| **Work** | `Work Item` | Job, Execution Unit, Task, Request |
| **Your AI** | `AI` | Agent Cluster, Model, LLM, Harness |
| **Result** | `Result` | Artifact, Output, Payload |
| **In Progress** | `Working` | Active Execution Context, Processing |
| **Knowledge** | `Knowledge` | Datasource, MCP Context, Embeddings |
| **AI Inbox** | `Inbox` | Notification Center, Queue, Thread |
| **Projects** | `Project` | Workspace, Channel, Binding |

---

## 4. "A Day With My AI Chief of Staff"

**08:00 AM:** Ashutosh opens the app. The **Executive Briefing** greets him: *"Good morning. Yesterday, I completed 4 items. I am currently monitoring competitor pricing. I need 2 approvals from you."*

**08:02 AM:** Ashutosh checks the **AI Inbox**. He sees a drafted email to investors. He clicks `Approve`. The Work Item transitions to `Publishing`, then `Completed`.

**08:05 AM:** Ashutosh types his intent: *"Find me flight options to NYC next Tuesday and book the cheapest one."* The Work Item enters `Planning`, then `Working`. Ashutosh closes his laptop and drives to the office.

**08:30 AM (Offline):** While driving, the AI queries Delta and JetBlue. It hits a high-risk action (spending money). The state changes to `Approval`, triggering a push notification to Ashutosh's phone.

**09:00 AM:** Ashutosh arrives at the office. The **Empty Workspace Story** is nonexistent; his Home screen is alive. His Executive Briefing says: *"Waiting for you: Approve $240 Delta Flight."*

**09:05 AM:** He clicks the item, views the Trust Timeline (`08:12 - Searched Delta; 08:14 - Found $240 fare`), and clicks `Approve`. The AI transitions to `Completed`.

**01:00 PM:** The AI encounters a **Failure Psychology** event while trying to pull Q3 metrics from a broken CRM API. It retries once, then transitions to `Waiting`. The AI Inbox updates: *"I hit a roadblock connecting to Salesforce. Can you re-authenticate?"* Ashutosh doesn't feel like *he* failed; he feels his assistant needs a key.

**06:00 PM:** Ashutosh logs off. The AI automatically transitions into scheduled `Working` jobs, digesting everything into the **Memory Model** so tomorrow's briefing is even smarter.

---

## 5. Design Validation Review

**Required Signatures:**
* `[ ]` User Advocate: "This reads exactly like having a human assistant."
* `[ ]` Trust Team: "The failure states protect the user; the timeline guarantees transparency."
* `[ ]` Domain Architect: "The single Work Item schema simplifies the entire data layer."
* `[ ]` Product Council: "Ready to hand over to Architecture."
