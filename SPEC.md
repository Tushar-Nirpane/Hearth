# Hearth — Technical Specification

Contracts are frozen once the UI is wired. Add tools; do not rename them.

---

## 1. System shape

```
Browser (simulation of Alexa+)
        │  POST /api/turn
        ▼
BFF (Express)  ──MCP client──▶  Hearth MCP server (POST /mcp)
                                        │
                                        ▼
                              SQLite: properties, utility_points,
                              assets, service_records,
                              runbook_sessions, incidents
                                        │
                                        ▼
                              Bedrock (capture only, never in the step machine)
```

Two processes, same codebase:

- `src/index.ts` — MCP server + static UI + BFF on port 8787
- `src/server.ts` — tool registration, imported by `index.ts`

The BFF exists only because a browser cannot speak the MCP transport directly with a session header. It is a stand-in for Alexa's NLU. In production, Alexa+ calls `/mcp` directly.

---

## 2. MCP transport contract

| Property | Value |
|---|---|
| Transport | Streamable HTTP |
| Protocol version | `2025-11-25` |
| Endpoint | `POST /mcp` (also `GET /mcp` for SSE, `DELETE /mcp` to close) |
| Session header | `mcp-session-id`, issued on `initialize` |
| Content type | `application/json` requests, `text/event-stream` responses |
| Auth (demo) | none — local only |
| Auth (production note) | OAuth 2.1 + PKCE resource server; not implemented to protect the 4-day schedule, documented in README |

Statelessness rule: **transport sessions may die; runbook sessions live in SQLite.** Any client can call `resume_runbook(sessionId)` on a new connection.

---

## 3. Tool contracts

All tools return `content: [{ type: "text", text: "<json>" }]`. Errors set `isError: true` and return `{ error, message }`.

### 3.1 `get_property`

```json
// input
{ "propertyId": "prop_alder" }

// output
{
  "id": "prop_alder",
  "address": "1427 Alder Street",
  "yearBuilt": 1962,
  "utilityPoints": [
    { "kind": "water_main", "location": "Basement, left of the furnace",
      "accessNotes": "Behind the white access panel. It's a lever, not a wheel.",
      "verified": true, "confidence": 0.95 }
  ]
}
```

### 3.2 `find_shutoff`

```json
// input
{ "propertyId": "prop_alder", "utility": "water_main" }

// output — recorded
{ "found": true, "utility": "water_main",
  "location": "Basement, left of the furnace",
  "accessNotes": "Behind the white access panel.",
  "source": "owner_recorded", "confidence": 0.95 }

// output — not recorded (the important one)
{ "found": false, "utility": "water_main", "reason": "not_recorded",
  "guidance": "This shutoff is not recorded for this house. Do not guess. Tell the user to call the utility or a professional." }
```

**Invariant:** `verified = 0` in the database must produce `found: false`. There is no fallback to general knowledge, ever.

### 3.3 `get_asset`

```json
// input
{ "propertyId": "prop_alder", "query": "dishwasher" }

// output
{
  "found": true,
  "id": "as_dishwasher",
  "name": "Dishwasher",
  "make": "Bosch",
  "model": "SHX78CM5N",
  "serial": "SN-4471-882",
  "location": "Kitchen",
  "warrantyEndsAt": "2027-03-14",
  "serviceHistory": [
    { "performedAt": "2025-11-02", "vendor": "Northside Appliance",
      "notes": "Supply line replaced under warranty. No charge." }
  ]
}
```

Matching: case-insensitive `LIKE` across `name`, `make`, `model`, `location`. First match ordered by `name`.

### 3.4 `start_runbook`

```json
// input
{ "propertyId": "prop_alder", "emergencyType": "water" }

// output
{
  "sessionId": "12e9ed9a-...",
  "incidentId": "fcb32e61-...",
  "status": "active",
  "stepId": "source",
  "say": "I can help. First: is the water coming from the ceiling, or from under a sink or appliance?",
  "expect": "choice",
  "choices": ["ceiling", "under a sink", "not sure"],
  "done": false
}
```

### 3.5 `answer_runbook`

```json
// input
{ "sessionId": "12e9ed9a-...", "answer": "under the sink" }

// output — same shape as start_runbook
{
  "sessionId": "12e9ed9a-...",
  "incidentId": "fcb32e61-...",
  "status": "active",
  "stepId": "under_sink",
  "say": "Find the small oval valve on the supply line under the sink. Turn it clockwise until it stops. Tell me when it's done.",
  "expect": "confirm",
  "done": false
}
```

Unrecognised answer → stay on the same step, prefix with `"I didn't catch that."`, do **not** advance.

### 3.6 `resume_runbook`

```json
{ "sessionId": "12e9ed9a-..." }
```

Returns the current step in the same shape. Must be idempotent.

### 3.7 `draft_claim` (Day 2)

```json
// input
{ "incidentId": "fcb32e61-..." }

// output
{
  "incidentId": "fcb32e61-...",
  "incidentType": "water",
  "occurredAt": "2026-10-18T16:34:00Z",
  "assetsInvolved": [
    { "name": "Dishwasher", "make": "Bosch", "model": "SHX78CM5N",
      "warrantyEndsAt": "2027-03-14", "warrantyActive": true }
  ],
  "stepsTaken": [ { "stepId": "under_sink", "at": "..." } ],
  "draft": "..."
}
```

---

## 4. Runbook DSL

A runbook is data, not code. The engine only walks it.

```ts
interface Step {
  id: string;
  say: string;                     // may contain {{water_main.location}}
  expect: "confirm" | "choice";
  choices?: { label: string; next: string }[];
  next?: string;                   // required when expect === "confirm"
  requires?: UtilityKind;          // gate on a verified utility point
  missingTarget?: string;          // branch when the gate fails
  terminal?: boolean;              // ends the flow, status = completed
}
```

Engine rules, in order:

1. On entering a step with `requires`, look up a **verified** utility point.
2. If absent or `confidence < 0.5`, jump to `missingTarget`.
3. Render `{{<kind>_location}}` and `{{<kind>_access_notes}}` from the verified record only.
4. Append the step and the user's answer to the incident.
5. If `terminal`, set `status = "completed"`.

Choice matching order: exact substring → token coverage (all tokens of a label present) → affirmative/negative lexicon. No fuzzy ML.

### Water flow

```
source ─┬─ ceiling ──────┐
        ├─ under_sink ── check ─┬─ yes → done → close
        └─ to_main ─────────────┴─ no  → to_main
                                        
to_main ─[requires water_main]─▶ check_main ─┬─ yes → done
         └─[missing]──────────▶ no_record      └─ no  → call_pro → close
```

### Gas flow

```
leave → outside → done
```

First instruction is always evacuation. This is the clearest argument for a deterministic engine: the ordering is a safety property, not a generation task.

---

## 5. Database schema

```sql
properties(id TEXT PK, address TEXT, year_built INTEGER)

utility_points(id TEXT PK, property_id TEXT, kind TEXT, location TEXT,
               access_notes TEXT, verified INTEGER, source TEXT, confidence REAL)

assets(id TEXT PK, property_id TEXT, name TEXT, make TEXT, model TEXT,
       serial TEXT, location TEXT, warranty_ends_at TEXT)

service_records(id TEXT PK, asset_id TEXT, performed_at TEXT, vendor TEXT, notes TEXT)

runbook_sessions(id TEXT PK, property_id TEXT, emergency_type TEXT, step_id TEXT,
                 answers TEXT, status TEXT, started_at TEXT, updated_at TEXT)

incidents(id TEXT PK, property_id TEXT, type TEXT, started_at TEXT, status TEXT,
          session_id TEXT, summary TEXT, steps_taken TEXT, assets_involved TEXT)
```

JSON columns (`answers`, `steps_taken`, `assets_involved`) are `TEXT` for portability. Do not normalise them during the hackathon.

Seed data: `prop_alder` = complete record; `prop_canyon` = no utility points, used by the refusal test.

---

## 6. HTTP API (BFF + UI)

### `POST /api/turn`

```json
// request
{ "propertyId": "prop_alder", "text": "there's water under the sink", "sessionId": "optional" }

// response
{
  "say": "Find the small oval valve...",
  "sessionId": "12e9ed9a-...",
  "stepId": "under_sink",
  "expect": "confirm",
  "choices": [],
  "panel": { "kind": "incident", "data": { "...": "..." } }
}
```

### `POST /api/capture/photo`

```json
// multipart or base64
{ "propertyId": "prop_alder", "imageBase64": "..." }

// response
{ "fields": { "name": "Dishwasher", "make": "Bosch", "model": "SHX78CM5N",
              "serial": "SN-4471-882", "confidence": 0.92 },
  "requiresConfirmation": true }
```

### `POST /api/assets/confirm`

Persists the confirmed fields. Returns the saved asset.

### `GET /api/incidents/:id`

Returns the incident with `stepsTaken` and `assetsInvolved`.

---

## 7. Evaluation harness

`test/fixtures/utterances.json`:

```json
[
  { "text": "there's water everywhere", "expect": { "tool": "start_runbook", "type": "water" } },
  { "text": "I smell gas in the kitchen", "expect": { "tool": "start_runbook", "type": "gas" } },
  { "text": "where's the water shutoff", "expect": { "tool": "find_shutoff" } },
  { "text": "when was the boiler last serviced", "expect": { "tool": "get_asset" } },
  { "text": "hmm", "expect": { "tool": "clarify" } }
]
```

Three suites:

| Suite | What it asserts | Pass bar |
|---|---|---|
| Intent | 40 utterances map to the right tool | ≥ 90% |
| Refusal | 5 unrecorded-shutoff cases return `found:false` | 100% |
| Resume | Kill the client mid-runbook, reconnect, `resume_runbook` | 100%, same `stepId` |

Publish the results table in the README. Do not tune the fixtures to the router; write the utterances first.

---

## 8. Environment

```bash
PORT=8787
HEARTH_DB=./hearth.db
CAPTURE_MODE=mock            # mock | bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

---

## 9. What is deliberately out of scope

- Real OAuth 2.1 (documented, not implemented)
- Multi-property accounts and permissions
- Push notifications
- Any medical claim, diagnosis, or fall detection
- Native mobile app

State these in the README's "what's mocked / what's next" section. Judges reward a bounded scope more than an unfinished everything.
