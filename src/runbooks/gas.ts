import type { Runbook } from "../types.js";

/**
 * Gas smell.
 * The first instruction is always to leave. This is why the flow is not LLM-generated.
 */
export const gasRunbook: Runbook = {
  id: "gas-v1",
  emergencyType: "gas",
  title: "Gas smell",
  start: "leave",
  steps: {
    leave: {
      id: "leave",
      say: "Get everyone out of the house now. Don't switch anything on or off — not even a light. Tell me when you're outside.",
      expect: "confirm",
      next: "outside",
    },
    outside: {
      id: "outside",
      say: "Call your gas utility from outside. Don't go back in for anything. Tell me when you've called them.",
      expect: "confirm",
      next: "done",
    },
    done: {
      id: "done",
      say: "Stay outside until the utility clears the house. I've logged this incident with the time it started.",
      expect: "confirm",
      terminal: true,
    },
  },
};
