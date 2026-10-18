import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAsset, getProperty, findVerifiedPoint } from "./db.js";
import { answerRunbook, resumeRunbook, startRunbook } from "./engine.js";
import type { EmergencyType, UtilityKind } from "./types.js";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const fail = (code: string, message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
  isError: true,
});

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "hearth",
    version: "0.1.0",
  });

  server.registerTool(
    "get_property",
    {
      title: "Get property profile",
      description:
        "Return the profile of a house: address, year built, and every recorded utility shutoff with verification status.",
      inputSchema: { propertyId: z.string().describe("Property identifier, e.g. prop_alder") },
    },
    async ({ propertyId }) => {
      const property = getProperty(propertyId);
      if (!property) return fail("property_not_found", `No property ${propertyId}`);
      return json({
        id: property.id,
        address: property.address,
        yearBuilt: property.yearBuilt,
        utilityPoints: property.utilityPoints.map((p) => ({
          kind: p.kind,
          location: p.location,
          accessNotes: p.accessNotes,
          verified: p.verified,
          confidence: p.confidence,
        })),
      });
    },
  );

  server.registerTool(
    "find_shutoff",
    {
      title: "Find a shutoff",
      description:
        "Locate a utility shutoff for this specific house. Returns found=false when the location has not been verified — never guess a location.",
      inputSchema: {
        propertyId: z.string(),
        utility: z.enum(["water_main", "gas_meter", "electrical_panel"]),
      },
    },
    async ({ propertyId, utility }) => {
      const property = getProperty(propertyId);
      if (!property) return fail("property_not_found", `No property ${propertyId}`);
      const point = findVerifiedPoint(propertyId, utility as UtilityKind);
      if (!point) {
        return json({
          found: false,
          utility,
          reason: "not_recorded",
          guidance:
            "This shutoff is not recorded for this house. Do not guess. Tell the user to call the utility or a professional.",
        });
      }
      return json({
        found: true,
        utility,
        location: point.location,
        accessNotes: point.accessNotes,
        source: point.source,
        confidence: point.confidence,
      });
    },
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get an appliance or system",
      description:
        "Look up an appliance or house system by name, make, model, or location. Includes warranty end date and service history.",
      inputSchema: {
        propertyId: z.string(),
        query: z.string().describe("Free text, e.g. 'dishwasher' or 'boiler'"),
      },
    },
    async ({ propertyId, query }) => {
      const asset = getAsset(propertyId, query);
      if (!asset) return json({ found: false, query });
      return json({ found: true, ...asset });
    },
  );

  server.registerTool(
    "start_runbook",
    {
      title: "Start an emergency runbook",
      description:
        "Begin a guided, step-by-step procedure for a home emergency. Returns exactly one instruction and a sessionId. Continue with answer_runbook.",
      inputSchema: {
        propertyId: z.string(),
        emergencyType: z.enum(["water", "gas", "electric", "hvac"]),
      },
    },
    async ({ propertyId, emergencyType }) => {
      try {
        return json(startRunbook(propertyId, emergencyType as EmergencyType));
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return fail(message, "Could not start runbook");
      }
    },
  );

  server.registerTool(
    "answer_runbook",
    {
      title: "Answer the current runbook step",
      description:
        "Send the user's answer to the current step. Returns the next single instruction. State is persisted, so the flow survives a dropped connection.",
      inputSchema: {
        sessionId: z.string(),
        answer: z.string(),
      },
    },
    async ({ sessionId, answer }) => {
      try {
        return json(answerRunbook(sessionId, answer));
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return fail(message, "Could not advance runbook");
      }
    },
  );

  server.registerTool(
    "resume_runbook",
    {
      title: "Resume a runbook",
      description:
        "Return the current step for an existing session. Use after a disconnect, or when the user says 'where were we'.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      try {
        return json(resumeRunbook(sessionId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return fail(message, "Could not resume runbook");
      }
    },
  );

  return server;
}
