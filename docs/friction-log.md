# Friction log

| # | Task attempted | What happened | Expected vs actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|
| 1 | Connect MCP client to Streamable HTTP endpoint | Session header handshake required on initialize; new clients without session ID get 400 | Expected persistent connection pooling out of the box; actual requires managing session headers | 3 | Maintain a single client instance `getMcpClient()` across BFF turns with auto-reconnect | SDK could provide higher-level HTTP client pooling with auto-reconnect on session drop |
| 2 | Render verified utility point in runbook | Runbook step used `{{water_main.location}}` (dot), while engine regex used `(\w+)_(location)` (underscore) | Expected basement location; actual showed raw template braces `{{...}}` | 3 | Aligned runbook interpolation tokens to underscore syntax `{{water_main_location}}` | Support both dot and underscore delimiters in engine regex `(\w+)[._](location)` |
| 3 | Handle compound emergency utterance | User saying *"there is water under the sink"* triggered `start_runbook`, which prompted ceiling vs sink | User already declared the location; re-asking felt robotic in an emergency | 4 | In `/api/turn`, check if initial utterance answers step 1 choices and auto-advance | Add composite `start_and_answer` MCP tool or accept initial context payload |
| 4 | Web Speech API in automated sandbox | Headless testing blocked microphone permissions and driver download | Expected mic interaction; actual was blocked by environment | 2 | Built permanent, always-visible text input fallback in `public/index.html` with suggestion pills | Always maintain accessible text input fallback for voice applications |
| 5 | Runbook copy under 22-word constraint | Original `no_record` refusal was 36 words, giving advice on recording shutoffs later | In an active leak, extra explanation increases cognitive load | 2 | Trimmed `no_record` to 19 urgent words directing user to call professional immediately | Add word-count check in CI smoke suite for runbook copy strings |
| 6 | Concurrent DB access during test runs | SQLite file access under simultaneous server and smoke test execution | Potential lock contention on `hearth.db` | 2 | Enabled `journal_mode = WAL` in `db.ts` and excluded WAL/SHM in `.gitignore` | Keep WAL pragma standard across all SQLite entry points |

---

## Day 1 Time Tracking & Calibration

- **Estimated:** 8.0 hours
- **Actual:** ~6.5 hours
- **Notes:** Server core and 8-check smoke suite were already verified. Block 1.2 (`/api/turn`) and Block 1.3 (`public/index.html`) completed ahead of schedule. Surplus buffer will be carried forward to Day 2 for AWS Bedrock capture pipeline integration.
