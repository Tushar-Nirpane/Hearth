# Hearth — Backend

MCP server (Streamable HTTP, protocol 2025-11-25) built with Express + SQLite + AWS Bedrock.

## Structure

```
backend/
├── src/
│   ├── index.ts        # Express server, MCP transport, session map
│   ├── server.ts       # MCP tool registration (7 tools)
│   ├── engine.ts       # Deterministic runbook state machine
│   ├── db.ts           # SQLite schema & queries
│   ├── seed.ts         # Demo data
│   ├── types.ts        # Shared types
│   ├── api/
│   │   ├── turn.ts     # BFF turn handler
│   │   └── capture.ts  # Appliance photo capture
│   └── runbooks/
│       ├── water.ts    # Water emergency steps
│       └── gas.ts      # Gas emergency steps
├── test/
│   ├── smoke.ts        # End-to-end MCP checks (7 tools)
│   ├── eval.ts         # 40-utterance intent benchmark
│   └── fixtures/
├── Dockerfile          # Multi-stage build (build context = repo root)
├── railway.json        # Railway deployment config
├── fly.toml            # Fly.io deployment config
└── .env.example        # Environment variable reference
```

## Quick start

```bash
cd backend
npm install
npm run seed      # populate demo database
npm run build
npm start         # http://localhost:8787
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | HTTP listen port |
| `HEARTH_DB` | `./hearth.db` | SQLite file path |
| `CAPTURE_MODE` | `mock` | `mock` or `live` (AWS Bedrock) |
| `AWS_REGION` | `us-east-1` | Bedrock region (live mode only) |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-sonnet-4-5-...` | Model (live mode only) |
| `FRONTEND_DIR` | `../frontend` | Path to frontend folder |

## MCP Endpoint

```
POST/GET/DELETE  /mcp   (Streamable HTTP)
GET              /health
```

## Deploy to Railway

1. Connect `Tushar-Nirpane/Hearth` repo in [railway.app](https://railway.app)
2. Railway reads `railway.json` — build context is repo root, Dockerfile is `backend/Dockerfile`
3. Add env vars in Railway dashboard (at minimum: `PORT`, `HEARTH_DB`, `CAPTURE_MODE`)
4. Add a persistent volume mounted at `/data` and set `HEARTH_DB=/data/hearth.db`
