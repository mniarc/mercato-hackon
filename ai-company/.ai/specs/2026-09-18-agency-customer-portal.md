# AI Agency — Customer Portal & its interaction with the staff panel (`agency` module)

> Status: **foundation draft** for the `feat/agency-portal` branch. Builds on the reviewed spec `spec-v-01/2026-09-18-ai-agency-order-fulfilment.md` (OM-01…OM-06) and Paweł's architecture. This document turns the client interface from "deferred Phase 8 / backend simulated panel" into a **first-class customer portal**, and defines exactly how that portal and the staff back-office panel interact.

## 🇵🇱 TL;DR (po polsku)
Portal klienta i panel pracownika to **dwie skóry na jednym silniku** — nie rozmawiają ze sobą bezpośrednio. Obie czytają i piszą do **tych samych encji** (`case`, `document_version`, `approval`, `request`). Spoiwem są **zdarzenia (events)** i **jeden wspólny triaż G**. Klient na portalu: wybiera ofertę → wypełnia dane (inicjuje zamówienie) → dostaje wersje do akceptacji → akceptuje / zgłasza uwagi / pyta → zatwierdza publikację → odbiera pakiet. Każda akcja klienta to **`request` (WE-KLIENT)**, który wpada do triażu G, a panel pracownika pokazuje to samo zlecenie na żywo. Agenci pracują; pracownik wchodzi tylko przy wyjątku (E).

---

## 1. Core principle: two surfaces, one shared state

There are **two human-facing surfaces** over the same order case:

| Surface | Audience | Where | Role |
|---|---|---|---|
| **Customer portal** | the client who bought the service | `agency/frontend/[orgSlug]/portal/…` | initiate the order, review exact document versions, approve / comment / ask, consent to publication, receive the package |
| **Staff panel (case card)** | the agency operator | `agency/backend/…` (+ tab on the sales order) | observe every department, task, version, decision and blocker; act **only** on exceptions (E) |

**They never call each other.** Both read and write the same records. The connective tissue is **domain events** + the **single triage pipeline G**. This is the OM-sanctioned pattern (no cross-surface coupling; shared entities + events).

## 2. Shared state the portal touches

Owned by the `agency` module (per the reviewed spec). The portal is a **thin client** over these — it never writes a document or advances a stage directly.

| Entity | Portal reads | Portal writes |
|---|---|---|
| `case` (order case, `stage` P1–P9) | ✅ status, current stage, what's awaiting the client | ❌ (only the orchestrator changes stage) |
| `document_version` (brief / strategy / ToV / plan / post) | ✅ the exact version to review | ❌ (only agents produce versions) |
| `approval` (per version: content / publication) | ✅ what's approved | ✅ **records the client's approval of an exact version** |
| `request` (WE-KLIENT / WEW-ZGLOSZENIE) | ✅ own thread | ✅ **every client action becomes one `request`** (approve, change, question, consent, upload) |
| `source` (attachments) | — | ✅ client-uploaded materials |
| `delivery` (KLI-PAKIET) | ✅ final package + publication link | ❌ |

**Golden rule (from the brief):** the client never edits agency output; the client **acts on an exact version**, and every action is one classified request. A new version never inherits an old approval.

## 3. How the portal interacts with the staff panel (the answer)

The bridge is **events + the triage pipeline G**. Neither surface imports or calls the other.

### 3a. Client → agency (portal action reaches the panel)
1. Client does something on the portal (e.g. "Approve this brief v3", "I want a change", "Question", "I consent to publish post v2 on Discord", uploads a file).
2. Portal calls an `agency` API command that creates **one `request` record** with `channel: 'portal'`, tied to the `case` + the **exact `document_version`** + the acting customer user.
3. That emits a domain event (e.g. `agency.request.created` / `agency.client.replied`).
4. The **triage pipeline G** (a subscriber, OM-03) runs once: `G.1` intake/dedupe → `G.2` intent → (if change) `G.3` scope + `G.4` impact → `G.5` **one recorded disposition** routed to exactly one allowed step.
5. Effect:
   - **Approval** → an `approval` is recorded on that version → the orchestrator advances the `case` stage → the next department agent runs.
   - **Change** → downstream versions marked `needs_review` (stale-dependency blocking); routed back to the responsible step for a new version.
   - **Question / material** → routed, no stage change.
6. The **staff panel** shows the same `case` updating **live** (events with `clientBroadcast` → SSE): the new request, its classification, the disposition, the stage move. Staff also receive an in-app `notification`. Staff do **not** act unless it becomes an exception (E).

> The panel is not "notified by the portal" — it re-renders the shared case because the same records changed and the event bridge pushed the update.

### 3b. Agency → client (agent/staff output reaches the portal)
1. A department agent produces a new `document_version` (status: `awaiting_client_approval`).
2. The orchestrator parks the `case` at an approval gate and emits an event; the client optionally gets a portal/email notification.
3. The **portal** shows the new version to review live (portal event bridge) — back to §3a.
4. Publication (P8): only after the client's **publication `approval`** (exact version + target) does the publication pipeline run; its proof + link land on both surfaces.

### 3c. Sequence (one loop, both surfaces)
```
Agent produces brief v3 ─▶ case: awaiting_client_approval ─▶ event
        │                                                      │
   (staff panel: "waiting on client")            (portal: brief v3 to review)
                                                               │
                                        Client clicks "Approve v3" (portal)
                                                               │
                                   request{channel:portal, version:v3} + event
                                                               │
                                     Triage G (once) ─▶ approval(v3) recorded
                                                               │
                              orchestrator: stage → strategy ─▶ next agent runs
                                                               │
        (staff panel live-updates)                 (portal shows next step)
```

## 4. Portal surface (screens) mapped to the process

All under `agency/frontend/[orgSlug]/portal/…`, guarded by `requireCustomerAuth` + `requireCustomerFeatures`.

| Screen | Path | Process | Purpose |
|---|---|---|---|
| Offer | `/portal/agency` | P1.1 | show START KOMUNIKACJI (from catalog): price, scope, exclusions, unlimited-revisions rule; **Order** button |
| Order form | `/portal/agency/order` | P1.3–1.4 | collect WEW-DANE-ZAMOWIENIA (brand, **WWW required**, market, language, contact, billing, optional goal), confirm fixed terms → create order (test payment for demo) |
| My case | `/portal/agency/[caseId]` | P2–P9 | friendly stage view, documents list, history; live-updating |
| Review & approve | in the case view | P4/5/6/7 + G | show exact version; **Approve this version / Request change / Ask** → one `request` |
| Publication consent | in the case view | P8 | separate explicit consent: exact post version + target |
| Messages & uploads | in the case view | G | client messages + file attachments → one intake (triage) |
| Delivery | `/portal/agency/[caseId]/delivery` | P9 | final documents + clickable publication link |

## 5. Auth & RBAC
- Reuse `portal` (login/signup/magic-link/reset/shell) and `customer_accounts` (customer identity). **Enable both in `apps/mercato/src/modules.ts`.**
- Portal pages declare `requireCustomerAuth: true` and `requireCustomerFeatures: ['agency.portal.view' | 'agency.portal.order' | …]` in `page.meta.ts`.
- The acting customer is the authenticated portal user; every `request`/`approval` records **who + when + which version** (identity is server-side, never trusted from input).

## 6. OM reuse vs. what `agency` builds
- **Reuse:** `portal` + `customer_accounts` (auth/shell), catalog/sales (offer + order), `attachments` (uploads), events + portal event bridge (live updates), `notifications` (staff alerts), the shared `agency` entities (case/document_version/approval/request).
- **Build (agency, portal side):** the 7 screens above + the portal API commands that create `request`/`approval` records with `channel: 'portal'`. The triage pipeline G, orchestrator, agents and staff panel are shared with the rest of the module (already scoped in the main spec).

## 7. Relationship to the reviewed spec
The main spec chose (Q5) a **backend "client actions panel"** for the demo and deferred the portal to Phase 8. This document makes the portal a real surface **without changing the contracts**: request intake, approval-per-version and publication consent are channel-independent, so the portal and the backend panel are two skins over the identical mechanism. The `channel` field distinguishes them (`portal` vs `backend_simulated`).

## 8. Build order (portal slice)
1. Enable `customer_accounts` + `portal` in `modules.ts`; confirm the empty portal (login → dashboard) runs.
2. Grant the demo client a portal role with `agency.portal.*` features.
3. Offer + order screens → create a paid (test) case (reuses OM-01).
4. "My case" read view over the shared `case`/`document_version` (live via event bridge).
5. Review & approve action → `request` + `approval(version)` → verify it flows through triage G and advances the case (visible on the staff panel).
6. Publication consent + delivery screens.

## 9. Open questions
- Portal notifications channel to the client (in-portal only vs also email)?
- One case per order (yes) — can a client hold multiple concurrent cases in the portal list?
- Attachment size/type limits for client uploads (reuse `attachments` defaults).
- Do we show the internal audit (competitor analysis) in the portal delivery, or only the purchased results? (brief: client receives the purchased results.)

## 10. Document task frontend (2026-09-18)

The app-local `agency` module overrides the existing portal task list/detail loaders through
`modules.ts` route overrides. The original `portal.tasks.view` customer guard and navigation
metadata remain in force. Standard tasks without `formSchema.agencyReview` retain their original
renderer. No workflow engine, API, database, or approval entity is changed by this frontend slice.

One document is one task: brief, strategy, Tone of Voice, plan, post. Publication consent is a
sixth task for the exact post version and destination. Strategy and ToV remain a joint process
gate: the backend must combine their decisions against the current pair; the browser never
advances the case. This separate-task UI is the explicit product decision for this implementation.

### Frontend data handoff

The existing authorized `GET /api/workflows/portal/tasks/{id}` response supplies the immutable
client-facing HTML snapshot in `task.formSchema.agencyReview`:

```ts
{
  caseId: string, documentId: string, versionId: string, version: string,
  templateId: 'WZR-BRIEF' | 'WZR-STRATEGIA' | 'WZR-TOV' | 'WZR-PLAN' | 'WZR-POST',
  title: string, html: string,
  status: 'ready_for_review' | 'approved' | 'needs_review' | 'blocked' | 'draft',
  isCurrent: boolean,
  mode: 'content' | 'topic_choice' | 'publication',
  topics?: Array<{ id: string, title: string, readiness: 'ready' | 'blocked' }>,
  target?: { id: string, ref: string, label: string, platform: string },
  contentApproved?: boolean
}
```

`status` is the state of this review invitation; a publication invitation may be ready for review
while `contentApproved` confirms that its underlying post version already passed content approval.
HTML is rendered in a sandboxed iframe without script, same-origin, form, popup, or parent-navigation
permissions. Its CSP permits inline document styling and embedded data images/fonts, not external
resources. The producer must supply a self-contained client rendering of the WZR template: no
internal envelope, evidence IDs, QA payloads, or secrets. HTML replaces the older `rendered_md`
presentation requirement at the user's explicit request.

Below the document are exactly two decisions: Accept and Add comments. The latter opens an
embedded CrudForm dialog (required, trimmed comments; Escape cancels; Ctrl/Cmd+Enter submits).
The plan requires exactly 12 ready, uniquely identified topics and one selection. Publication
requires previously approved content and a readable destination. Historical, blocked, malformed,
closed, and read-only tasks cannot be accepted. A version change resets the UI; a late response
for a previous version must not mark the new one as submitted.

### Request contract and integration boundary

Actions call the reviewed spec's `POST /api/agency/cases/{caseId}/requests` with `channel: 'portal'`,
`documentId`, `versionId`, and a retry-stable `externalEventId`. Content accepts use `kind: 'approval'`
with no body; plans use `kind: 'topic_choice'` plus `topicId`; publication uses `kind: 'consent'`
plus `targetId` and `targetRef`. Comments use `kind: 'message'` and `body`. Success requires a
successful response containing `requestId` and `status`; it means received, not yet approved by G.
Failures retain the comment text and allow retry. There is no direct task completion or case-stage
mutation in this renderer.

Backend implementation is still required on this branch: creation of review tasks with this HTML
projection, request intake, server-side owner/current-version validation, idempotency, G routing,
the strategy/ToV pair gate, and durable approvals. Frontend flags are UX, never authorization.

### Test preview and validation

The Tasks screen links to `/[orgSlug]/portal/agency/tasks-demo`, an authenticated, explicitly marked
preview of six FLOW document tasks. Decisions are held in component state only; reset/reload clears
them. It does not create database rows or send production approvals.

Local validation includes parser/request tests and rendered iframe/dialog tests. Key coverage:
exact version and body-free approval, nonempty comments, stale versions, plan topic cardinality,
separate publication consent, iframe isolation, dialog cancellation, and failed-submit text retention.
Live end-to-end request processing remains blocked on the agency backend described above.

Validation result (local runner): 41 Jest tests passed, app typecheck and scoped ESLint passed,
and the Next.js production build completed with the project's 8 GB Node heap setting. The
generator completed using its existing static OpenAPI fallback (upstream JSON import-attribute
warning). Browser inspection was unavailable because the computer-use runtime failed to start.

### Risks and compliance

- Stale or cross-customer submissions: server must enforce scope/version checks; UI prevents known
  stale decisions but cannot replace that check.
- Untrusted HTML: sandbox and CSP isolate the document from portal identity and script execution.
- Duplicate clicks/retries: in-flight lock and stable event IDs; durable deduplication belongs to G.
- Compatibility: original task routes, guards and generic renderer preserved; app-local override only.

### Changelog

- 2026-09-18: Added HTML document review frontend, separate comments dialog, version-bound request
  handoff and six-task preview. Production agency backend remains outside this frontend slice.
