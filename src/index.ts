import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";
import { handleTurn } from "./api/turn.js";
import { handlePhotoCapture, handleAssetConfirm, handleGetIncident } from "./api/capture.js";

import path from "node:path";

import { db } from "./db.js";
import { seed } from "./seed.js";

const propertyCount = (db.prepare("SELECT COUNT(*) AS n FROM properties").get() as { n: number }).n;
if (propertyCount === 0) {
  console.log("[boot] empty database — seeding demo data");
  seed();
}

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(process.cwd(), "public")));
app.post("/api/turn", handleTurn);
app.post("/api/capture/photo", handlePhotoCapture);
app.post("/api/assets/confirm", handleAssetConfirm);
app.get("/api/incidents/:id", handleGetIncident);

const PORT = Number(process.env.PORT ?? 8787);
const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; lastActive: number }
>();


app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hearth",
    transport: "streamable-http",
    sessions: sessions.size,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  try {
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    let transport: StreamableHTTPServerTransport;

    if (existing) {
      existing.lastActive = Date.now();
      transport = existing.transport;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, lastActive: Date.now() });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      await buildServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: missing or unknown session" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP POST failed", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(404).send("Session not found");
    return;
  }
  session.lastActive = Date.now();
  await session.transport.handleRequest(req, res);
};

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.lastActive < cutoff) {
      session.transport.close().catch(() => undefined);
      sessions.delete(id);
    }
  }
}, 60_000).unref();

app.listen(PORT, () => {
  console.log(`Hearth MCP listening on http://localhost:${PORT}/mcp`);
});
