# Product Feedback & Mini-Challenges

## 1. Alexa+ & Ring Tooling Feedback

### What We Used
- **Streamable HTTP MCP Transport (Protocol 2025-11-25):** Deployed as a self-hosted Model Context Protocol server exposing house-specific tools (`get_property`, `find_shutoff`, `get_asset`, `start_runbook`, `answer_runbook`, `resume_runbook`, `draft_claim`).
- **Alexa+ Tool Calling Model:** Designed to bridge voice assistant NLU with deterministic tools, allowing Alexa to call structured APIs rather than hallucinate critical infrastructure locations.
- **Web Speech API Frontend:** Simulated the Alexa+ multimodal experience in a clean browser UI combining conversational voice input/output with dynamic visual house records.

### What Worked Well
1. **Model Context Protocol (MCP) as an Integration Standard:** Moving away from proprietary custom skill slot models to standardized MCP tools is a game-changer. Developing and testing tools locally with standard TypeScript types and MCP inspectors was significantly faster than testing legacy Alexa Skills Kit (ASK) Lambda endpoints.
2. **Deterministic Tool Invocations for Safety:** The MCP model enabled us to cleanly enforce a strict boundary: statistics and LLMs explain or transcribe, but state machines and SQLite databases decide.

### Onboarding & Developer Friction
1. **Streamable HTTP Session Lifecycle:** Managing session continuity across disconnects in voice interfaces requires clear session ID propagation. The `@modelcontextprotocol/sdk` could offer more turnkey connection pooling and reconnect handlers for Streamable HTTP endpoints.
2. **Documentation on Streamable HTTP vs SSE:** Most MCP documentation still highlights stdio or SSE; comprehensive examples of production Streamable HTTP servers for Alexa+ agents would accelerate developer adoption.

### Would We Build on Alexa+ Again?
**Yes, absolutely.** For emergency home management, hands-free voice interaction is not just a convenience — it's a safety requirement when a homeowner's hands are full or shutoff valves are located in dark basements.

---

## 2. AWS Builder Mini-Challenge

### Architecture Overview
Hearth leverages AWS services to automate the ingestion of physical home appliances into digital operating records:

- **Amazon Bedrock (Converse API / Claude 3 Sonnet):**  
  - **Purpose:** Vision-based multimodal extraction from appliance nameplate photographs (`POST /api/capture/photo`).
  - **Function:** When a user uploads or photographs a water heater, boiler, or dishwasher nameplate, Bedrock parses make, model number, serial number, and electrical/water specifications into strict JSON without prose.
  - **Reliability Engineering:** Hearth implements a `CAPTURE_MODE=mock` safety fallback to guarantee demo resilience under network or credential constraints, satisfying zero-failure production criteria.
- **Amazon S3 (Planned Storage Layer):**  
  - Secure storage for property photographic records, utility meter inspection shots, and signed insurance claim attachments.
- **AWS Lambda & Amazon DynamoDB (Deployment Architecture):**  
  - The deterministic runbook engine (`engine.ts`) and SQLite state machine can be hosted serverless on AWS Lambda with state stored in DynamoDB for global multi-tenant scaling.

---

## 3. Open Source Mini-Challenge: `hearth-runbook-engine`

To give back to the open source developer community, Hearth's core runbook state machine has been designed for clean extraction into a standalone, zero-dependency NPM package: `hearth-runbook-engine`.

### Standalone Package Summary
- **Package Name:** `hearth-runbook-engine`
- **License:** MIT
- **Repository:** `https://github.com/hearth-org/hearth-runbook-engine`
- **Core Files Extracted:**
  - `src/engine.ts`: Zero-dependency deterministic runbook engine
  - `src/types.ts`: TypeScript contracts for Steps, Choices, Incidents, and Sessions
  - `src/runbooks/water.ts`: 9-step water emergency runbook with refusal branches
  - `src/runbooks/gas.ts`: 3-step gas leak runbook with evacuation-first safety invariant

### 200-Word Package Abstract
> `hearth-runbook-engine` is a lightweight, zero-dependency TypeScript library for executing deterministic, safety-critical guided runbooks. Unlike conversational chatbots that generate unverified instructions, `hearth-runbook-engine` strictly guarantees one instruction per turn, enforces linear branching logic, and persists exact conversational step position across network disconnections. Designed specifically for voice assistants, emergency triage, and field operations, the engine interpolates verified property facts (such as shutoff locations) while deterministically refusing to guess when data is missing. Steps are defined in a clean DSL supporting confirmations, multi-choice branching, and automated incident event logging.
