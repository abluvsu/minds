# Phase 1: Product Council Deliverables

**STATUS:** LOCKED  
**GATE:** Phase 1 complete and frozen.

These deliverables define the operating model of a business owner's workday. No UI screens, no React components, no implementation details.

---

## 1. Vision
**Your AI Chief of Staff.**
Give it work. Leave. Come back to completed work. 
The system operates as a **Business Operating System**, entirely replacing the paradigm of an "AI Workspace" with a "Work Completion System."

---

## 2. Personas
**Primary Persona: The Non-Technical Business Owner**
* **Context:** Extremely busy. Evaluates ROI on time constantly.
* **Technical Skill:** Zero programming. Comfortable with basic ChatGPT queries, but frustrated by having to "manage" the chat to get good results.
* **Patience:** Minimal. If a screen requires configuring more than two settings before seeing value, they will churn.
* **Goal:** "I need this done so I can focus on growing my business."

---

## 3. Jobs To Be Done (JTBD)
The system exists solely to resolve these statements:

* I need a **proposal** drafted and finalized.
* I need **competitor research** compiled and verified.
* I need **emails** triaged and drafted.
* I need **reports** generated from my spreadsheets.
* I need **meeting notes** organized into action items.
* I need **recurring market checks** scheduled every Monday.

---

## 4. Information Architecture: The Business OS Map
The canonical structure of the user's data and interaction. 

```
Business
  ↓
Projects (Groupings of context)
  ↓
Work (Active tasks being executed)
  ↓
Results (Published, completed deliverables)
  ↓
Knowledge (Connected data sources / uploaded files)
  ↓
Memory (What the AI has learned about the business across sessions)
```
*Note: Concepts like "Channel Bindings", "Workspaces", or "Providers" are completely eliminated from the user's worldview.*

---

## 5. Today's Work Model
The Home screen operating model revolves entirely around the states of work, completely replacing "chat history" as the primary view.

1. **Working:** What the AI is actively doing right now.
2. **Waiting:** What the AI is waiting on (e.g., waiting for an external email reply, waiting for a scheduled time).
3. **Needs Approval:** Actions the AI cannot take without human consent.
4. **Completed:** Results that are ready for the user to consume.
5. **Scheduled:** Recurring jobs that will happen automatically.

---

## 6. The Task Lifecycle
Every piece of work delegated to the AI MUST pass through this exact lifecycle.

`Request → Planning → Working → Waiting → Completed → Archived`

1. **Request:** The user's raw intent ("Handle my emails").
2. **Planning:** The AI determines the steps required.
3. **Working:** The AI executes the steps (e.g., searching, drafting).
4. **Waiting:** Execution pauses (e.g., for user approval or an external trigger).
5. **Completed:** The result is delivered in the highest-fidelity format (Interactive HTML > Dashboard > Document > Chat).
6. **Archived:** The result is saved, and learnings are committed to Memory.

---

## 7. Approval Policy
The explicit rules defining when the AI must pause execution and ask for human permission.

| Action Type | Requires Approval? | Rationale |
| :--- | :---: | :--- |
| **Deletions** | **YES** | Permanent data loss is unacceptable. |
| **Emails/Comms** | **YES** | Sending messages on behalf of the user carries reputation risk. |
| **Money/Spend** | **YES** | Cannot authorize transactions without consent. |
| **Publishing** | **YES** | Making data public requires explicit sign-off. |
| **Research** | NO | Gathering public info is safe. |
| **Summaries** | NO | Analyzing existing user data is safe. |
| **Formatting** | NO | Restructuring documents is safe. |
| **Reading DBs** | NO | Read-only operations on connected data are safe. |

---

## 8. Terminology & Navigation

### Terminology (What we say)
* ❌ Harness/Provider → ✅ **Coworker / AI**
* ❌ Scratchpad → ✅ **Working... / Thinking...**
* ❌ Artifacts → ✅ **Results**
* ❌ Datasources → ✅ **Knowledge**
* ❌ Chat Sessions → ✅ **Work**

### Primary Navigation Model
* **Today:** The OS Dashboard (Work states, Needs Approval).
* **Projects:** Where related work and knowledge are grouped.
* **Results:** The archive of finalized deliverables.
* **Knowledge:** Connected documents and business data.
* **Settings:** Billing, Profile, Preferences.

---

### Request for Approval
**Product Council (Team A)** submits this deliverable to the **Program Sponsor**. 
If approved, Phase 1 will be **LOCKED**, and **Phase 2 (Customer Experience Team)** will open to design the wireframes and interactions based strictly on this operating model.
