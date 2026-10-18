# Hearth

**The operating record of a house, exposed to Alexa+ as a self-hosted MCP server.**

Alexa knows how to turn off a water main. It doesn't know where yours is.

Hearth is a self-hosted MCP server that holds the house-specific facts a voice assistant needs in an emergency — where the shutoffs are, what the boiler is, when it was last serviced, what the dishwasher's warranty covers — and walks the user through a deterministic, resumable procedure one step at a time.

Track: **Alexa+** · Transport: **Streamable HTTP** · Protocol: **2025-11-25**

---

## Quick start

```bash
npm install
npm run seed      # demo property with a full record, plus an empty one for refusal tests
npm run build
npm start         # http://localhost:8787/mcp
```

In a second terminal:

```bash
npm run smoke
```

Expected:

```
PASS  exposes 6 tools
PASS  property resolves
PASS  verified shutoff is returned
PASS  unverified shutoff is refused, not guessed
PASS  runbook starts with one question
PASS  advances to a single instruction
PASS  resumes at the same step after a reconnect
PASS  gas flow leads with evacuation
All checks passed.
```

Inspect the server with any MCP client:

```bash
npx @modelcontextprotocol/inspector
# transport: Streamable HTTP
# url: http://localhost:8787/mcp
```

---

## Why this exists

- **63 million** Americans provide ongoing care or household support for someone else (AARP, 2025).
- **75%** of adults 50+ want to remain in their home as they age (AARP, 2024).
- The national median assisted-living cost is **$6,200/month** (CareScout, 2025).

The common thread isn't frailty. It's **undocumented houses**. The shutoff is behind a panel nobody has opened. The warranty expired without anyone noticing. The plumber's number is in a text from 2023.

Voice is the right interface for this because the moment you need it, your hands are wet, the power is out, or you're standing in a basement with a flashlight.

---

## Architecture

![Architecture](assets/architecture.png)

| Layer | Responsibility |
|---|---|
| `src/index.ts` | Express, Streamable HTTP transport, session map, static UI, BFF |
| `src/server.ts` | MCP tool registration |
| `src/engine.ts` | Deterministic runbook state machine |
| `src/runbooks/*.ts` | Step data for water and gas |
| `src/db.ts` | SQLite schema and queries; `findVerifiedPoint()` is the refusal boundary |
| `src/seed.ts` | Demo data |

---

## Tools

| Tool | Purpose |
|---|---|
| `get_property` | Address, year built, all recorded utility points |
| `find_shutoff` | Locate a shutoff — refuses when unverified |
| `get_asset` | Appliance/system lookup with warranty and service history |
| `start_runbook` | Begin a guided emergency procedure |
| `answer_runbook` | Advance one step |
| `resume_runbook` | Return to the current step after a disconnect |

Full contracts: [`SPEC.md`](SPEC.md).

---

## The two design rules

**1. Statistics and state machines decide; language models explain.**
No LLM sits inside the runbook step machine. Step order is a safety property — "get everyone out of the house" must come before "call the utility", every time, deterministically. Bedrock is used only to extract structured fields from photos and documents.

**2. Never guess a shutoff.**
`find_shutoff` returns `found: false` when a location hasn't been verified for that specific house. The refusal is the product: an assistant that invents a valve location is worse than no assistant.

---

## What is mocked

- Authentication is absent in the demo. Production would use OAuth 2.1 + PKCE as an MCP resource server.
- `CAPTURE_MODE=mock` returns fixed extraction fields when Bedrock is unavailable.
- The browser UI stands in for Alexa+; it speaks to the same `/mcp` endpoint the assistant would.
- Only two runbooks are implemented (water, gas). The DSL supports more.

## What's next

- OAuth 2.1 resource server
- Realtor handover flow (the cold-start solution)
- More runbooks: electrical, HVAC, lockout
- Insurance claim export
- On-device document extraction for privacy

---

## Development

```bash
npm run dev     # tsx watch
npm run build   # tsc
npm run smoke   # end-to-end MCP checks
```

See [`BUILD-PLAN.md`](BUILD-PLAN.md) for the 4-day schedule and [`SPEC.md`](SPEC.md) for contracts.

MIT licensed.
