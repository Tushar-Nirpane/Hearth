# The pause

Ask someone where their water shutoff is.

There is a pause. Then a guess. *Under the sink? The basement, maybe, behind the panel?*

That pause is the whole product.

Voice assistants are extraordinarily good at the general case. Alexa knows how to shut off a water main. It does not know where *yours* is, because that fact was never written down anywhere a machine can read. It lives in a drawer, in a text from 2023, or nowhere at all.

I built Hearth for that gap. It is a self-hosted MCP server that holds one house's operating record — verified shutoff locations, appliance models and serials, warranty dates, service history — and walks a person through an emergency one step at a time.

## What it does

Hearth exposes seven tools over MCP (Streamable HTTP, spec `2025-11-25`): `get_property`, `find_shutoff`, `get_asset`, `start_runbook`, `answer_runbook`, `resume_runbook`, and `draft_claim`.

When someone says *"there's water under the sink,"* Hearth does not generate advice. It starts a deterministic runbook: one disambiguating question, then exactly one instruction, then waits for confirmation. Position is persisted in SQLite after every step, so a dropped call resumes at the same place instead of starting over.

The same record answers quieter questions. *When was the boiler last serviced? What's the dishwasher's model number? Is the supply line still under warranty?*

## The decision I kept coming back to

The refusal.

`find_shutoff` returns `found: false` when a location has not been verified for that specific property. It does not infer a plausible answer from general knowledge. On the empty property used in the demo, the UI says: **"This shutoff is not recorded for this house."**

An assistant that invents a valve location is worse than no assistant. In an emergency, a confident wrong answer sends someone to the wrong room while the floor is flooding. The refusal is not an edge case — it is the product's entire claim to trust.

That principle shaped the architecture: **statistics and state machines decide; language models explain.** No LLM sits inside the step machine, because step order is a safety property. "Get everyone out of the house" must precede "call the utility" every single time, deterministically. The only place a model belongs is extraction — turning a nameplate photo into structured fields. That path is scaffolded for Bedrock but returns deterministic mock data today; no AWS call is made.

## How I built it

- **Backend:** Node 22, TypeScript, Express, `better-sqlite3`
- **Protocol:** MCP TypeScript SDK, Streamable HTTP transport, session map, all durable state in SQLite
- **Runbooks:** a small DSL — steps as data, the engine walks them; water (9 steps) and gas (3 steps)
- **Frontend:** a single `index.html`, no framework, no build step, Web Speech API with a text fallback that is always visible
- **Capture:** nameplate extraction UI, scaffolded for Bedrock but returning deterministic mock fields
- **Deploy:** Docker on Railway, SQLite on a persistent volume at `/data`
- **Evaluation:** 40 utterances, 5 refusal cases, 3 mid-call disconnects — 40/40, 5/5, 3/3

## Challenges

**MCP sessions versus runbook sessions.** The transport session is disposable; the runbook position is not. Separating those two lifetimes was the first real design decision, and it is what makes `resume_runbook` work on a brand-new connection.

**Resisting the LLM.** The obvious build is "send the situation to a model and let it respond." That produces a system that is fluent and unaccountable. Keeping the model outside the safety path meant writing the runbook engine by hand — and then proving it with tests instead of vibes.

**The restructure broke the frontend.** After splitting the repo into `backend/` and `frontend/`, every runbook response threw `ReferenceError: updateClaimDraft is not defined`. The UI caught it and displayed *"Connection to MCP server lost"* — a network error message for a JavaScript bug. I found it by driving the page in headless Chrome and reading the console, not by staring at the UI.

**Deployment fought back.** Railway's Railpack auto-detector saw a repo with no root Dockerfile and decided it was a static site, so it built a Caddy image that served an empty folder. The fix was a root Dockerfile that builds `backend/` and copies `frontend/` in. A second bug surfaced locally: `new URL(import.meta.url).pathname` percent-encodes spaces, so a repo path containing a space produced `AMAZON%20hackathon` and a 404 on the frontend. `fileURLToPath()` fixed it.

**Being honest about what is mocked.** The Bedrock capture path is not implemented. The endpoint returns deterministic fields, and `CAPTURE_MODE` is read but never acted on. I chose to document that plainly rather than enter the AWS Builder mini challenge on the strength of an import that does not exist.

## What I learned

The hard part of an agent product is not the model. It is deciding what the agent must refuse to do, and then making that refusal structural rather than aspirational.

I also learned that demo reliability is engineering, not presentation. Recording the walkthrough meant building a replay harness, waiting for real UI state instead of sleeping, and guarding every step — which is the same discipline the product needs.

## What's next

OAuth 2.1 + PKCE for account linking, a realtor handover flow (the cold-start answer), more runbooks (electrical, HVAC freeze, lockout), real Bedrock extraction, and claim export for insurers.

Alexa knows how. Hearth knows where.

---

**Built with:** TypeScript, Node.js, Express, SQLite, MCP SDK, Docker, Railway, HTML/CSS/JavaScript

**Repository:** https://github.com/Tushar-Nirpane/Hearth
**Demo video:** https://youtu.be/scuF6O7mVag
**Live demo:** https://hearth-production-8551.up.railway.app
