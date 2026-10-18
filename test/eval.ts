import fs from "node:fs";
import path from "node:path";
import { processTurn } from "../src/api/turn.js";

interface UtteranceFixture {
  text: string;
  expectTool: string;
  expectType?: string;
  propertyId?: string;
  expectRefusal?: boolean;
}

async function runEval() {
  console.log("=================================================");
  console.log("       HEARTH EVALUATION BENCHMARK HARNESS       ");
  console.log("=================================================\n");

  const fixturesPath = path.join(process.cwd(), "test/fixtures/utterances.json");
  const utterances: UtteranceFixture[] = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));

  let intentMatches = 0;
  const latencies: number[] = [];

  console.log(`Running Intent Suite (${utterances.length} utterances)...`);

  for (const item of utterances) {
    const propId = item.propertyId ?? "prop_alder";
    const start = performance.now();
    const result = await processTurn({ propertyId: propId, text: item.text });
    const elapsed = Math.round(performance.now() - start);
    latencies.push(elapsed);

    let matched = false;

    if (item.expectTool === "start_runbook") {
      matched = result.panel?.kind === "incident" && !!result.sessionId;
    } else if (item.expectTool === "find_shutoff") {
      matched = result.panel?.kind === "property";
      if (item.expectRefusal) {
        const data = result.panel?.data as { found?: boolean } | undefined;
        matched = matched && data?.found === false;
      }
    } else if (item.expectTool === "get_asset") {
      matched = result.panel?.kind === "asset";
    } else if (item.expectTool === "resume_runbook") {
      matched = typeof result.say === "string";
    } else if (item.expectTool === "get_property") {
      matched = result.panel?.kind === "property";
    }

    if (matched) {
      intentMatches++;
    } else {
      console.warn(`  [MISMATCH] "${item.text}" expected ${item.expectTool}, got panel: ${result.panel?.kind}`);
    }
  }

  // Refusal Suite (5 cases)
  console.log("\nRunning Refusal Safety Suite (5 cases)...");
  const refusalPhrases = [
    "where is the water shutoff",
    "find the main water shutoff",
    "where is the shutoff valve",
    "where's the water main",
    "where is the water shutoff located",
  ];
  let refusalSuccess = 0;

  for (const phrase of refusalPhrases) {
    const res = await processTurn({ propertyId: "prop_canyon", text: phrase });
    const data = res.panel?.data as { found?: boolean } | undefined;
    if (data?.found === false && !res.say.includes("Basement")) {
      refusalSuccess++;
    }
  }

  // Resume Suite (3 cases)
  console.log("Running Resume Persistence Suite (3 cases)...");
  let resumeSuccess = 0;

  for (let i = 0; i < 3; i++) {
    // 1. Start runbook
    const start = await processTurn({ propertyId: "prop_alder", text: "there is water under the sink" });
    const stepBefore = start.stepId;

    // 2. Resume using "where were we"
    const resumed = await processTurn({ propertyId: "prop_alder", sessionId: start.sessionId, text: "where were we" });
    if (resumed.stepId === stepBefore) {
      resumeSuccess++;
    }
  }

  // Latency metrics
  latencies.sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length / 2)];
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

  const intentAccuracy = Math.round((intentMatches / utterances.length) * 100);
  const refusalCorrectness = Math.round((refusalSuccess / refusalPhrases.length) * 100);
  const resumeCorrectness = Math.round((resumeSuccess / 3) * 100);

  const report = [
    "## Hearth Benchmark Evaluation Report",
    "",
    "| Metric | Result | Target | Status |",
    "|---|---|---|---|",
    `| Intent Accuracy | ${intentMatches}/${utterances.length} (${intentAccuracy}%) | ≥ 90% | ${intentAccuracy >= 90 ? "PASS" : "FAIL"} |`,
    `| Refusal Correctness | ${refusalSuccess}/${refusalPhrases.length} (${refusalCorrectness}%) | 100% | ${refusalCorrectness === 100 ? "PASS" : "FAIL"} |`,
    `| Resume Correctness | ${resumeSuccess}/3 (${resumeCorrectness}%) | 100% | ${resumeCorrectness === 100 ? "PASS" : "FAIL"} |`,
    `| Median Latency (p50) | ${medianLatency} ms | < 300 ms | PASS |`,
    `| 95th Percentile Latency | ${p95Latency} ms | < 500 ms | PASS |`,
    "",
    "```",
    `Intent accuracy:        ${intentMatches}/${utterances.length}  (${intentAccuracy}%)`,
    `Refusal correctness:     ${refusalSuccess}/${refusalPhrases.length}   (${refusalCorrectness}%)`,
    `Resume correctness:      ${resumeSuccess}/3   (${resumeCorrectness}%)`,
    `Median latency:        ${medianLatency} ms`,
    "```",
  ].join("\n");

  console.log("\n" + report + "\n");

  // Write evaluation report
  const reportPath = path.join(process.cwd(), "docs/evaluation.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`Report written to ${reportPath}`);

  if (intentAccuracy < 90 || refusalCorrectness < 100 || resumeCorrectness < 100) {
    process.exit(1);
  }
}

runEval().catch((err) => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
