import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAsset, getProperty, findVerifiedPoint, getIncident } from "./db.js";
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

  server.registerTool(
    "draft_claim",
    {
      title: "Draft an insurance or warranty claim",
      description:
        "Generate a structured insurance claim draft from an incident record, including involved appliances and documented timeline.",
      inputSchema: {
        incidentId: z.string().describe("Identifier of the logged incident"),
      },
    },
    async ({ incidentId }) => {
      const incident = getIncident(incidentId);
      if (!incident) return fail("incident_not_found", `No incident with ID ${incidentId}`);
      const property = getProperty(incident.propertyId);

      // Resolve involved assets or relevant property assets
      const assetsInvolved = (incident.assetsInvolved ?? []).map((assetId: string) => {
        const full = property ? getAsset(property.id, assetId) : null;
        const warrantyActive = full?.warrantyEndsAt
          ? new Date(full.warrantyEndsAt) > new Date()
          : false;
        return {
          name: full?.name ?? "Appliance",
          make: full?.make ?? "Unknown",
          model: full?.model ?? "Unknown",
          serial: full?.serial ?? "Unknown",
          warrantyEndsAt: full?.warrantyEndsAt ?? null,
          warrantyActive,
        };
      });

      const draftText = [
        `HOME INSURANCE / WARRANTY INCIDENT REPORT`,
        `Incident Reference: ${incident.id}`,
        `Property: ${property?.address ?? incident.propertyId}`,
        `Incident Type: ${incident.type.toUpperCase()}`,
        `Reported Date: ${incident.startedAt}`,
        `Current Status: ${incident.status}`,
        `Summary: ${incident.summary}`,
        ``,
        `CHRONOLOGICAL MITIGATION STEPS:`,
        ...incident.stepsTaken.map((s, idx) => `  ${idx + 1}. [${s.at}] Step ${s.stepId}${s.answer ? ` - Response: "${s.answer}"` : ""}`),
        ``,
        `ASSETS INVOLVED & WARRANTY STATUS:`,
        ...(assetsInvolved.length > 0
          ? assetsInvolved.map((a) => `  - ${a.name} (${a.make} ${a.model}) | Serial: ${a.serial} | Warranty: ${a.warrantyEndsAt ?? "N/A"} (${a.warrantyActive ? "ACTIVE" : "EXPIRED/NONE"})`)
          : ["  - No specific assets flagged during initial triage"]),
        ``,
        `CLAIM STATEMENT:`,
        `On ${incident.startedAt}, a ${incident.type} event occurred at ${property?.address ?? "the insured property"}. Hearth guided immediate mitigation runbooks to isolate the fault. All documented steps and appliance serials are recorded above for adjuster evaluation.`
      ].join("\n");

      return json({
        incidentId: incident.id,
        incidentType: incident.type,
        occurredAt: incident.startedAt,
        assetsInvolved,
        stepsTaken: incident.stepsTaken,
        draft: draftText,
      });
    },
  );

  return server;
}
