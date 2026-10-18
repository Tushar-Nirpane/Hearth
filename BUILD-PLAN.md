# Hearth — 4-Day Build Plan

**Track:** Alexa+ (self-hosted MCP server, Streamable HTTP)
**Submission deadline:** 4 days from now
**Working assumption:** one developer, ~10 hours/day, using an IDE agent.

Read `SPEC.md` for the contracts. This file is the schedule and the definition of done.

---

## What already exists (verified)

Do **not** rebuild these. Run `npm run seed && npm run build && npm start` and then `npm run smoke` — 8 checks pass.

| File | State |
|---|---|
| `src/index.ts` | Express + Streamable HTTP MCP endpoint at `POST /mcp`, `/health`, session map, 30-min cleanup |
| `src/server.ts` | 6 registered tools: `get_property`, `find_shutoff`, `get_asset`, `start_runbook`, `answer_runbook`, `resume_runbook` |
| `src/engine.ts` | Deterministic runbook state machine, SQLite-persisted, resumable, choice matcher |
| `src/db.ts` | SQLite schema + queries. `findVerifiedPoint()` is the refusal boundary |
| `src/runbooks/water.ts` | 9-step water flow incl. `no_record` refusal branch |
| `src/runbooks/gas.ts` | 3-step evacuation-first flow |
| `src/seed.ts` | `prop_alder` (full record) + `prop_canyon` (empty, for refusal tests) |
| `test/smoke.ts` | 8 end-to-end checks through a real MCP client |

Verified output:

```
PASS  exposes 6 tools
PASS  property resolves
PASS  verified shutoff is returned
PASS  unverified shutoff is refused, not guessed
PASS  runbook starts with one question
PASS  advances to a single instruction
PASS  resumes at the same step after a reconnect
PASS  gas flow leads with evacuation
```

---

## Non-negotiables

These are what make the project credible. An IDE agent must not "simplify" them away.

1. **No LLM inside the step machine.** Steps are data, ordering is code. Bedrock may only extract structured data from photos/documents, and write prose after the fact.
2. **`verified = 0` means refuse.** Never return an unverified shutoff location, never infer one from general knowledge. The refusal *is* the product demo.
3. **One instruction per turn.** Never return a numbered list during a runbook.
4. **State lives in SQLite, not memory.** A dropped connection must not lose position.
5. **Tool names and input shapes are frozen** once the UI is wired. Add tools, don't rename them.
6. **Every new tool gets a smoke check.** No exceptions at this stage of the schedule.

---

## Day 1 — Make it demoable end to end (~8h)

Goal by end of day: say "there's water under the sink" into a browser and get a correct spoken next step, with the record visible beside it.

### Block 1.1 — Verify and commit (45 min)

```bash
cd hearth
npm install
npm run seed
npm run build
npm start          # terminal 1
npm run smoke      # terminal 2
```

- [ ] All 8 checks pass
- [ ] `git init`, commit as "deterministic runbook engine + MCP server"
- [ ] Add `MIT LICENSE` in this commit
- [ ] Create `docs/friction-log.md` with the first 3 entries from today

### Block 1.2 — `POST /api/turn` (2h)

A thin BFF that the simulation UI talks to. It is **not** the product; it stands in for Alexa's NLU.

`src/api/turn.ts`:

```ts
// Input:  { propertyId: string, text: string, sessionId?: string }
// Output: { say: string, sessionId?: string, stepId?: string,
//           expect?: 'confirm'|'choice', choices?: string[],
//           panel?: { kind: 'property'|'asset'|'incident', data: unknown } }
```

Routing rules, in order:

| Condition | Action |
|---|---|
| `sessionId` present and active | `answer_runbook` |
| text matches `/where.*(water|shut ?off)/i` | `find_shutoff` water_main |
| text matches `/gas/i` and `/smell|leak/i` | `start_runbook` gas |
| text matches `/water|leak|flood|pouring/i` | `start_runbook` water |
| text matches `/boiler|furnace|dishwasher|fridge/i` | `get_asset` |
| text matches `/where were we|continue/i` | `resume_runbook` |
| otherwise | `get_property` + a disambiguation line |

Implementation notes:

- Call the MCP server over HTTP with `@modelcontextprotocol/sdk` client, not by importing the engine. This proves the server is real in the video.
- Keep one MCP client instance; reuse it.
- Return the `panel` payload so the UI can show what the assistant knows.

**Done when:** `curl -X POST localhost:8787/api/turn -d '{"propertyId":"prop_alder","text":"there is water under the sink"}'` returns a `say` containing "small oval valve" and a `sessionId`.

### Block 1.3 — Simulation UI (3h)

`public/index.html` — one file, no framework, no build step. Served statically by Express.

Layout, desktop:

```
┌──────────────────────────────┬─────────────────────────┐
│  voice panel                 │  house record           │
│  ─ big mic button            │  ─ address, year        │
│  ─ live transcript           │  ─ shutoffs w/ verified │
│  ─ agent reply (large type)  │  ─ recent incident      │
│  ─ choice chips              │                         │
└──────────────────────────────┴─────────────────────────┘
```

Requirements:

- Web Speech API for input (`webkitSpeechRecognition`), `speechSynthesis` for output.
- **Text input fallback always visible.** The demo must not depend on a microphone permission dialog.
- Choice chips rendered from `expect`/`choices`.
- Large type (≥20px for the agent reply). This is a stressed person's interface.
- Mobile: single column, record panel collapses under the conversation.
- Empty state: "Say: there's water under the sink."
- Error state: if `/api/turn` fails, show `Connection lost — your place in the runbook is saved.` and a Resume button.

**Done when:** typing or speaking the four demo utterances produces the correct sequence, and the record panel updates.

### Block 1.4 — Copy pass on the runbooks (1h)

Read every `say` string out loud. Rewrite anything that sounds like documentation.

Rules: ≤ 22 words per instruction, no jargon, no "please", no numbered lists.

### Block 1.5 — Commit + friction log (30 min)

- [ ] `git add -A && git commit`
- [ ] 5+ friction log entries with severity ratings
- [ ] Note today's actual hours vs estimate (calibrates Days 2–4)

---

## Day 2 — Depth, evidence, and the second surface (~8h)

### Block 2.1 — Capture pipeline (3h, hard cutoff)

`POST /api/capture/photo` → Bedrock vision → structured asset fields → confirmation.

- Model: a Claude model on Bedrock via `@aws-sdk/client-bedrock-runtime` (`ConverseCommand`).
- Prompt: return strict JSON `{ name, make, model, serial, confidence }`. No prose.
- UI: drag a photo of a nameplate into the record panel; fields appear; user confirms; asset saved.
- **Hard cutoff:** if Bedrock credentials or model access aren't working by the 3-hour mark, set `CAPTURE_MODE=mock` (returns fixed JSON) and move on. Never let this block the video.

**Done when:** photo → fields → confirm → `get_asset` returns the new record, in under 15 seconds.

### Block 2.2 — Incident + claim draft (2h)

- `GET /api/incidents/:id` for the incident panel.
- `draft_claim` tool: incident + involved assets + warranty dates → a plain-text claim summary the user can paste into an insurer's form. Template-first, Bedrock polish optional.

This is the "so what" ending for the video: the record you built *before* the emergency pays out *after* it.

### Block 2.3 — Evaluation harness (2h) ⭐

`test/eval.ts` + `test/fixtures/utterances.json`:

```json
[
  { "text": "there's water everywhere", "expectTool": "start_runbook", "expectType": "water" },
  { "text": "the sink is leaking badly", "expectTool": "start_runbook", "expectType": "water" },
  { "text": "I smell gas", "expectTool": "start_runbook", "expectType": "gas" },
  { "text": "where's the water shutoff", "expectTool": "find_shutoff" }
]
```

40 utterances, including 8 messy/panicked phrasings and 5 that must be refused or clarified rather than guessed.

Report:

```
Intent accuracy:        38/40  (95%)
Refusal correctness:     5/5   (100%)
Resume correctness:      3/3   (100%)
Median latency:        180 ms
```

Write it into `docs/evaluation.md` and paste the table into the README. **This table is worth more than another feature.**

### Block 2.4 — README skeleton (1h)

Sections: what it is, why (3 numbers), architecture diagram, run instructions, tool table, evaluation table, what's mocked, what we'd build next.

---

## Day 3 — The video decides this (~9h)

### Block 3.1 — Visual polish (3h)

Only the three screens in the demo path. No new screens.

- [ ] Typography scale settled (agent reply 26–30px, transcript 16px)
- [ ] Colour: warm neutral background, one accent for "action required"
- [ ] Record panel shows `verified ✓` badges — the refusal moment needs to be legible
- [ ] Loading state while a tool call is in flight (a 400ms delay with no feedback looks broken)
- [ ] Test at 390px and 1440px

### Block 3.2 — Rehearsal and asset prep (2h)

- [ ] Seed a rich `prop_alder`: 6 assets, 4 service records, 3 shutoffs
- [ ] Print a fake nameplate photo for the capture shot (or use a stock appliance label)
- [ ] Rehearse the exact script 5 times; note every pause
- [ ] Fix whatever breaks; do not add features

### Block 3.3 — Record (2.5h)

Screen record at 1080p, 30fps. Voice-over recorded separately, then aligned.

| Time | Shot | Line |
|---|---|---|
| 0:00 | Black, sound of running water | — |
| 0:06 | Voice panel | "Alexa, there's water everywhere." |
| 0:12 | Agent reply | "Is it coming from the ceiling, or from under a sink?" |
| 0:20 | Choice chip tapped | "Under the sink." |
| 0:26 | Agent reply, large | "Find the small oval valve under the sink. Turn it clockwise until it stops." |
| 0:40 | Record panel | Voice-over: "It knows this house. Not houses in general." |
| 0:55 | Runbook continues | "Has the water stopped?" → "No." |
| 1:05 | Record panel highlights main shutoff | "Go to the basement, left of the furnace." |
| 1:25 | Cut to empty property | "On a house it doesn't know, it refuses to guess." → `found: false` |
| 1:45 | Split: voice UI + MCP Inspector JSON | "Underneath, it's a self-hosted MCP server. Alexa+ calls tools, not prompts." |
| 2:10 | Capture photo → fields fill | "The record builds itself from a photo of a nameplate." |
| 2:30 | Claim draft | "So when the plumber arrives, the warranty is already found." |
| 2:45 | End card | Repo URL, MIT license, "Ring track? No — Alexa+ track." |

- [ ] Under 3:00 hard
- [ ] Public on YouTube, English
- [ ] No third-party music or trademarks
- [ ] Captions burned in (judges watch muted sometimes)

### Block 3.4 — Upload + backup (30 min)

- [ ] Upload unlisted, check playback on a phone
- [ ] Keep the local master file

---

## Day 4 — Submission, not building (~6h)

### Block 4.1 — README final (1.5h)

Must include, near the top:

```
This repository contains a self-hosted MCP server (Streamable HTTP,
spec 2025-11-25). Entry point: src/index.ts. Tool registration: src/server.ts.
Start: npm install && npm run seed && npm run build && npm start
```

Judges must be able to find the MCP entry point in under 30 seconds.

- [ ] Architecture diagram (reuse `assets/architecture.png` style)
- [ ] Tool table with input/output
- [ ] Evaluation table
- [ ] "What is mocked" section — honesty scores better than pretending

### Block 4.2 — Friction log (45 min)

Table with: task attempted, steps, expected vs actual, severity (1–5), workaround, suggestion.

Aim for 12–18 entries. Cover: MCP SDK transport setup, session handling, spec version confusion, auth, Inspector quirks, Bedrock model access.

This is up to **10% of the judging score**. Do not skip it.

### Block 4.3 — Product feedback + mini challenges (45 min)

- [ ] Ring/Alexa tooling feedback: what you used, what worked, onboarding, would you build again
- [ ] AWS Builder: Bedrock + Lambda/S3/DynamoDB if used, documented per service
- [ ] Open Source: extract `src/engine.ts` + `src/runbooks/` into a standalone MIT repo `hearth-runbook-engine`, with a 200-word README. Include URL + GitHub username.

### Block 4.4 — Submit (1h)

- [ ] Repo public, MIT license visible in the GitHub header
- [ ] README renders correctly on GitHub (check images)
- [ ] Video link public
- [ ] Track: Alexa+
- [ ] Mini challenges: AWS Builder, Open Source
- [ ] Description: 150 words, first sentence is the hook
- [ ] Screenshot of the submission confirmation

### Block 4.5 — Buffer (2h)

Something will break. This is that time.

---

## Cut list, in order

If you fall behind, cut from the top:

1. Capture pipeline (Block 2.1) — nice, not load-bearing
2. Claim draft (Block 2.2) — keep only if the ending feels weak
3. Mobile layout — the video is desktop
4. Friction log depth — never cut below 8 entries
5. **Never cut:** evaluation table, refusal moment, resume test, video quality

---

## How to drive the IDE

Work one block at a time. Do not let it run all four days in one session.

**Opening prompt:**

```
Read BUILD-PLAN.md and SPEC.md in this repo. We are building Hearth for the
Amazon Developer Hackathon, Alexa+ track.

Rules:
- Do not modify src/engine.ts, src/runbooks/*.ts, or src/db.ts unless the task says so.
- Do not add dependencies without asking.
- Do not put an LLM call inside the runbook step machine.
- Never return an unverified shutoff location.

Today we implement Day 1, Block 1.2 only. Show me the diff before writing.
Definition of done is in the plan.
```

**Per-block prompt:**

```
Implement Block <X.Y> from BUILD-PLAN.md. 
Files you may touch: <list>.
Run `npm run build` and `npm run smoke` when done, and paste the output.
If a check fails, fix it before reporting completion.
```

**Review prompt, every evening:**

```
Audit today's changes against the Non-negotiables section of BUILD-PLAN.md.
List any violation. Then run the smoke test and the eval harness.
```

---

## Risk table

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Bedrock model access not granted | Medium | Medium | `CAPTURE_MODE=mock`; document Bedrock integration in README; AWS Builder still valid via documented use |
| MCP session handling breaks under the UI's reconnect | Medium | High | Runbook state is in SQLite; `resume_runbook` is the recovery path. Test it explicitly |
| Voice recognition fails during recording | High | Low | Text input is always visible; record with typed input and synthesize voice separately |
| Demo runs long | High | Medium | Hard 3:00 cap; cut the capture segment first |
| Scope creep | Certain | Fatal | The cut list is part of the plan |

---

## The three moments that win or lose this

1. **0:20 — one question, not five.** The judge recognises that this was designed for panic, not for a demo.
2. **1:25 — the refusal.** `found: false` on a house it doesn't know. That single JSON field is the difference between a chatbot and a trustworthy system.
3. **1:45 — the Inspector split screen.** Proof that the voice UI is a client of a real MCP server, not a scripted animation.
