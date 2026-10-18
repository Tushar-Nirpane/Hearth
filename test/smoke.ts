import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.HEARTH_URL ?? "http://localhost:8787/mcp";

const client = new Client({ name: "hearth-smoke", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(BASE)));

const parse = (res: unknown) => {
  const content = (res as { content: Array<{ text: string }> }).content;
  return JSON.parse(content[0].text);
};

let failures = 0;
const check = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`, detail ?? "");
  }
};

const tools = await client.listTools();
check("exposes 7 tools", tools.tools.length === 7, tools.tools.map((t) => t.name));

const property = parse(
  await client.callTool({ name: "get_property", arguments: { propertyId: "prop_alder" } }),
);
check("property resolves", property.address === "1427 Alder Street", property);

const found = parse(
  await client.callTool({
    name: "find_shutoff",
    arguments: { propertyId: "prop_alder", utility: "water_main" },
  }),
);
check("verified shutoff is returned", found.found === true && !!found.location, found);

const refused = parse(
  await client.callTool({
    name: "find_shutoff",
    arguments: { propertyId: "prop_canyon", utility: "water_main" },
  }),
);
check("unverified shutoff is refused, not guessed", refused.found === false, refused);

const started = parse(
  await client.callTool({
    name: "start_runbook",
    arguments: { propertyId: "prop_alder", emergencyType: "water" },
  }),
);
check("runbook starts with one question", started.expect === "choice", started);

const step2 = parse(
  await client.callTool({
    name: "answer_runbook",
    arguments: { sessionId: started.sessionId, answer: "under the sink" },
  }),
);
check("advances to a single instruction", step2.stepId === "under_sink", step2);

const resumed = parse(
  await client.callTool({
    name: "resume_runbook",
    arguments: { sessionId: started.sessionId },
  }),
);
check("resumes at the same step after a reconnect", resumed.stepId === step2.stepId, resumed);

const gas = parse(
  await client.callTool({
    name: "start_runbook",
    arguments: { propertyId: "prop_alder", emergencyType: "gas" },
  }),
);
check("gas flow leads with evacuation", /Get everyone out/i.test(gas.say), gas);

const claim = parse(
  await client.callTool({
    name: "draft_claim",
    arguments: { incidentId: started.incidentId },
  }),
);
check("drafts an insurance claim from incident", claim.incidentId === started.incidentId && typeof claim.draft === "string", claim);

await client.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
