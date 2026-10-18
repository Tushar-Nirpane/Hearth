import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Request, Response } from "express";
import { db } from "../db.js";

export interface TurnRequest {
  propertyId: string;
  text: string;
  sessionId?: string;
}

export interface TurnResponse {
  say: string;
  sessionId?: string;
  stepId?: string;
  expect?: "confirm" | "choice";
  choices?: string[];
  panel?: {
    kind: "property" | "asset" | "incident";
    data: unknown;
  };
}

let mcpClient: Client | null = null;

async function getMcpClient(): Promise<Client> {
  if (mcpClient) return mcpClient;
  const port = process.env.PORT ?? "8787";
  const url = process.env.HEARTH_URL ?? `http://localhost:${port}/mcp`;
  const client = new Client({ name: "hearth-bff", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  mcpClient = client;
  return client;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  try {
    const client = await getMcpClient();
    const res = await client.callTool({ name, arguments: args });
    const content = (res as { content?: Array<{ type: string; text: string }> }).content;
    if (!content || !content[0] || !content[0].text) {
      throw new Error(`Tool ${name} returned invalid content`);
    }
    return JSON.parse(content[0].text);
  } catch {
    mcpClient = null;
    const client = await getMcpClient();
    const res = await client.callTool({ name, arguments: args });
    const content = (res as { content?: Array<{ type: string; text: string }> }).content;
    if (!content || !content[0] || !content[0].text) {
      throw new Error(`Tool ${name} returned invalid content on retry`);
    }
    return JSON.parse(content[0].text);
  }
}

export async function processTurn(input: TurnRequest): Promise<TurnResponse> {
  const { propertyId, text, sessionId } = input;

  // Resume intent takes priority over active session answering
  if (/where were we|continue/i.test(text)) {
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const row = db
        .prepare(
          "SELECT id FROM runbook_sessions WHERE property_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
        )
        .get(propertyId) as { id: string } | undefined;
      targetSessionId = row?.id;
    }
    if (targetSessionId) {
      try {
        const res = await callTool("resume_runbook", { sessionId: targetSessionId });
        if (!res.error) {
          return {
            say: res.say,
            sessionId: res.sessionId,
            stepId: res.stepId,
            expect: res.expect,
            choices: res.choices ?? [],
            panel: { kind: "incident", data: res },
          };
        }
      } catch {
        // fall through
      }
    }
    return { say: "There is no active runbook to resume." };
  }

  // 1. sessionId present and active — forward answer to the runbook engine
  if (sessionId) {
    try {
      const res = await callTool("answer_runbook", { sessionId, answer: text });
      if (!res.error) {
        return {
          say: res.say,
          sessionId: res.sessionId,
          stepId: res.stepId,
          expect: res.expect,
          choices: res.choices ?? [],
          panel: { kind: "incident", data: res },
        };
      }
    } catch {
      // If session not active or not found, fall through
    }
  }

  // 2. text matches shutoff queries
  if (/(where|find|locate).*(water|shut ?off|main|valve)/i.test(text) || /shut ?off/i.test(text)) {
    const res = await callTool("find_shutoff", { propertyId, utility: "water_main" });
    if (res.found) {
      const notes = res.accessNotes ? ` ${res.accessNotes}` : "";
      return {
        say: `The water main shutoff is located at: ${res.location}.${notes}`,
        panel: { kind: "property", data: res },
      };
    } else {
      return {
        say:
          res.guidance ??
          "This shutoff is not recorded for this house. Do not guess. Tell the user to call the utility or a professional.",
        panel: { kind: "property", data: res },
      };
    }
  }

  // 3. text matches /gas/i and /smell|leak|odor|detect/i
  if (/gas/i.test(text) && /smell|leak|odor|detect/i.test(text)) {
    const res = await callTool("start_runbook", { propertyId, emergencyType: "gas" });
    return {
      say: res.say,
      sessionId: res.sessionId,
      stepId: res.stepId,
      expect: res.expect,
      choices: res.choices ?? [],
      panel: { kind: "incident", data: res },
    };
  }

  // 4. text matches /water|leak|flood|pouring/i
  if (/water|leak|flood|pouring/i.test(text)) {
    let res = await callTool("start_runbook", { propertyId, emergencyType: "water" });
    if (res.expect === "choice" && res.choices && res.choices.length > 0) {
      try {
        const answered = await callTool("answer_runbook", { sessionId: res.sessionId, answer: text });
        if (!answered.error && answered.stepId !== res.stepId) {
          res = answered;
        }
      } catch {
        // keep start_runbook result
      }
    }
    return {
      say: res.say,
      sessionId: res.sessionId,
      stepId: res.stepId,
      expect: res.expect,
      choices: res.choices ?? [],
      panel: { kind: "incident", data: res },
    };
  }

  // 5. text matches /boiler|furnace|dishwasher|fridge/i
  const assetMatch = text.match(/boiler|furnace|dishwasher|fridge/i);
  if (assetMatch) {
    const query = assetMatch[0];
    const res = await callTool("get_asset", { propertyId, query });
    if (res.found) {
      const makeModel = [res.make, res.model].filter(Boolean).join(" ");
      const loc = res.location ? ` in the ${res.location}` : "";
      const warranty = res.warrantyEndsAt ? ` Warranty ends ${res.warrantyEndsAt}.` : "";
      return {
        say: `Found ${res.name}${makeModel ? ` (${makeModel})` : ""}${loc}.${warranty}`,
        panel: { kind: "asset", data: res },
      };
    } else {
      return {
        say: `I don't have a record for ${query} for this property.`,
        panel: { kind: "asset", data: res },
      };
    }
  }


  // 7. otherwise: get_property + disambiguation line
  const property = await callTool("get_property", { propertyId });
  return {
    say: `I'm with you at ${property.address ?? "this property"}. Are you reporting a leak, smelling gas, looking for a shutoff, or checking an appliance?`,
    panel: { kind: "property", data: property },
  };
}

export async function handleTurn(req: Request, res: Response): Promise<void> {
  const { propertyId, text, sessionId } = req.body ?? {};
  if (!propertyId || typeof text !== "string") {
    res.status(400).json({ error: "missing_fields", message: "propertyId and text are required" });
    return;
  }

  try {
    const response = await processTurn({ propertyId, text, sessionId });
    res.json(response);
  } catch (error) {
    console.error("Turn processing error:", error);
    res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Internal turn error",
    });
  }
}
