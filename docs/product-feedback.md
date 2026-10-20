# Product feedback — Hearth (Alexa+ track)

## 1. Which developer tools, APIs, and SDKs did you use, and for what?

**MCP TypeScript SDK (`@modelcontextprotocol/sdk`, 1.32.x)** — the entire server. `McpServer` + `registerTool` for the seven tools, `StreamableHTTPServerTransport` for the HTTP transport, and the SDK's client (`Client` + `StreamableHTTPClientTransport`) for the nine-check smoke suite.

**Streamable HTTP, MCP spec `2025-11-25`** — the transport contract exposed at `POST /mcp`, with `mcp-session-id` session handling.

**Zod 4** — input schemas for every tool, so validation and the published JSON Schema come from one definition.

**Express 5 + Node 22 + TypeScript** — HTTP host, the `/api/turn` BFF, and static serving.

**better-sqlite3** — durable storage for properties, assets, incidents, and runbook position.

**Docker + Railway** — deployment, with SQLite on a persistent volume at `/data`.

**Not used, deliberately:** Amazon Bedrock. The nameplate-capture endpoint is scaffolded but returns deterministic mock data; no AWS SDK is wired, so this submission does not enter the AWS Builder mini challenge.

**Not available to us:** Alexa+ Preview. We took the documented simulated-experience path — a browser client that speaks to the same `/mcp` endpoint an Alexa+ agent would, with the simulation source in `frontend/`.

## 2. What worked well?

**`registerTool` is the right shape.** Name, description, Zod schema, handler — one place, and the tool list is immediately usable by any MCP client. A working server was ~30 lines.

**The protocol stayed out of the way.** Streamable HTTP is ordinary POST plus an SSE response. It ran behind Express and Railway without a proxy or transport shim, and behaved identically locally and in production.

**Session semantics were predictable once understood.** `mcp-session-id` arrives on `initialize`, is echoed on subsequent requests, and a missing/expired ID produces a clear 400/404. That made it straightforward to decide what belonged in the transport session and what belonged in the database.

**The SDK client is a good test harness.** `test/smoke.ts` drives the deployed server exactly as an assistant would — seven tools, a refusal case, a resume-after-reconnect case — and it caught real regressions.

**SQLite on a volume is the correct amount of infrastructure** for a service whose state is a few thousand rows and one runbook position.

## 3. What needs work?

**Stateful server examples are buried.** The spec allows stateful and stateless Streamable HTTP, but the only complete session-map example I found was inside `node_modules/.../examples/server/`. A first-class "stateful server with session management" example in the README would have saved most of a day. The failure modes (unknown session → 404, no session + non-initialize → 400) are easy to get wrong and hard to discover.

**Transport session vs. application session is an easy conflation.** The docs never quite say "`mcp-session-id` is disposable; your durable state is your problem." For a runbook that must resume after a dropped call, that distinction is the whole design.

**Version negotiation examples are thin.** Pinning `2025-11-25` worked, but there is little guidance on what a server should do when a client offers an older revision.

**No local harness that behaves like the assistant.** The simulated path is explicitly allowed, which is good — but there is no reference client that mimics Alexa's tool-selection and turn-taking. You are guessing at latency budget, barge-in behaviour, and how much text is reasonable to speak in one turn. A "fake Alexa" harness would make the simulated path much more predictive.

**MCP Inspector is good at discovery, weak at sequences.** Listing tools and calling one is clean. Replaying a multi-step stateful flow — answer, advance, disconnect, resume — is manual. That is exactly the flow this product lives on.

**Native module builds are still a tax.** `better-sqlite3` needed `python3`, `make`, and `g++` in a slim base image; prebuilt binaries were not reliable across base images. Not an Amazon issue, but it is the kind of thing that eats a hackathon afternoon.

## 4. How was onboarding?

**MCP SDK: fast to hello world, slow to correct.** Zero to a tool that responds: about 30 minutes. Zero to a server whose state survives a dropped connection, with the right session semantics: most of a day, almost all of it spent on transport lifecycle rather than tools.

**Express, TypeScript, SQLite: minutes.** Nothing surprising.

**Alexa+ track: the gate is access, not code.** Without Preview, the documentation explains the MCP contract well but not the *experience* contract — how long an answer should be, when to ask versus act, what the assistant does with a tool error. We designed those by judgement, which is the least defensible way to design them.

## 5. Would you build with these devices and services again?

**MCP: yes, without reservation.** It is the correct abstraction for "an assistant calls your domain's tools," and it keeps the product independent of which assistant is calling. The same server would work for any MCP host.

**Streamable HTTP + SQLite: yes**, for small stateful services. The operational surface is tiny and the resume behaviour is genuinely useful.

**Alexa+: yes, if Preview access or a realistic local harness exists.** The protocol side is ready. What is missing is a tight feedback loop on the interaction design — and for a product whose entire value is how it behaves in a stressful thirty seconds, that loop is the product.
