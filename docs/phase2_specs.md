# Phase 2: Service Design & Customer Experience (Revision 2)

**STATUS:** LOCKED  
**GATE:** Phase 2 complete and frozen.

This document contains the non-code design specifications for the operating model. It abandons "dashboard-centric" UX in favor of a conversational, trust-first **AI Chief of Staff Operating System**.

---

## Part 1: Service Designer (Team E)

### SD-01: Work Lifecycle & Priority
Every delegated intent follows this exact state machine, guided by a Priority (Critical, High, Medium, Low) determined automatically by the AI.
`Create Work → Planning → Working (w/ ETA) → Waiting → Approval Needed → Completed → Archived`

### SD-02: Missing Service Behaviors (Deterministic Rules)
* **AI Gets Stuck:** Wait 2 minutes → Retry once with different prompt/tool → If fails again, pause and ask user for help via AI Inbox.
* **User Disappears:** 
    * *5 min:* Keep working.
    * *1 hour:* Pause all non-safe actions (mutations). 
    * *24 hours:* Digest completed work into Executive Briefing. 
    * *7 days:* Suspend background tasks. Wait for next login.
* **Long-Running Work:** Must emit granular timeline events: `Started → Researching → Writing → Reviewing → Completed`. Must display a confidence score and ETA.
* **Revision Model:** **Version, never replace.** If user says "make it shorter", V1 is saved to history, V2 becomes active.

### SD-03: Notification & Inbox Matrix
Dashboards are dead. Updates go to the **AI Inbox**.
| Event | Destination | Priority | Rule |
| :--- | :--- | :--- | :--- |
| **Approval Needed** | AI Inbox (Pinned) | High | Block execution until answered. |
| **Error/Blocked** | AI Inbox | High | Requires user unblocking. |
| **Completed Work** | Executive Briefing | Low | Digested on next login. |

---

## Part 2: Customer Experience (Team B)

### UX-01: Home Screen (The Executive Briefing)
The Home Screen is no longer a KPI dashboard. It is a conversational OS.

```
Good Morning Ashutosh

Yesterday
✓ 4 tasks completed
⚠ 1 task blocked

Your AI completed while you were away:
✓ Hiring Dashboard (HTML Preview)
✓ Weekly Revenue Report (HTML Preview)
✓ Customer Email Drafts (Review Needed)

──────────────────────────
Waiting for you (AI Inbox)
Approve Quarterly Budget (High Priority)
Approve Email Campaign (High Priority)

──────────────────────────
Currently Working
⟳ Researching competitors (ETA: 12 min)
⟳ Cleaning CRM (ETA: 45 min)

──────────────────────────
What do you need finished today?
_____________________________
```

### UX-02: AI Activity Timeline (Trust Feature)
When a task is `Working`, the user can click it to see the **Trust Timeline**:
```
09:02 - Started research (Confidence: 95%)
09:10 - Reading website (Cost: $0.02)
09:14 - Generating report (ETA: 2m)
09:16 - Waiting for approval
```

### UX-03: Results (HTML First Principle)
Results are NOT markdown text streams. Every completed task automatically generates an interactive HTML artifact:
* Dashboards, Timelines, Kanban, Reports, Org Charts.
* Results appear with a Preview card: `[Preview] [Summary] [Open] [Export]`.

### UX-04: Progressive Disclosure & Trust (Team L)
* **Level 1 (Executive):** "Drafted email to Client."
* **Level 2 (Business):** Shows the draft and summary.
* **Level 3 (Trust):** Shows Cost, Confidence, Risk, exact timeline, and tokens used.

---

## Part 3: Clickable HTML Prototype
A significantly expanded clickable HTML prototype has been generated to validate the 7 core journeys:
1. Morning Check-in (Executive Briefing)
2. Delegate Task
3. Approval Flow
4. AI Activity Timeline (Working state)
5. Review Result (HTML Preview)
6. Revise Result (Versioning)
7. AI Inbox management

**Path:** `d:\Minds_db_my_folder\minds\prototype_v1\index.html`

**Gate Check:** If the prototype successfully simulates a business owner's day without feeling like an "application tracker," we request authorization to LOCK Phase 2 and open Phase 3 (Architecture).
