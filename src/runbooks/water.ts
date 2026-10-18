import type { Runbook } from "../types.js";

/**
 * Water intrusion.
 * Deterministic by design: one question, one step, one confirmation.
 * `to_main` requires a verified shutoff location and refuses to guess otherwise.
 */
export const waterRunbook: Runbook = {
  id: "water-v1",
  emergencyType: "water",
  title: "Water intrusion",
  start: "source",
  steps: {
    source: {
      id: "source",
      say: "I can help. First: is the water coming from the ceiling, or from under a sink or appliance?",
      expect: "choice",
      choices: [
        { label: "ceiling", next: "ceiling" },
        { label: "under a sink", next: "under_sink" },
        { label: "not sure", next: "to_main" },
      ],
    },
    ceiling: {
      id: "ceiling",
      say: "Don't stand under it. Move anything valuable out of the room and put a bucket down. Tell me when you're clear.",
      expect: "confirm",
      next: "to_main",
    },
    under_sink: {
      id: "under_sink",
      say: "Find the small oval valve on the supply line under the sink. Turn it clockwise until it stops. Tell me when it's done.",
      expect: "confirm",
      next: "check",
    },
    check: {
      id: "check",
      say: "Has the water stopped?",
      expect: "choice",
      choices: [
        { label: "yes", next: "done" },
        { label: "no", next: "to_main" },
        { label: "not sure", next: "to_main" },
      ],
    },
    to_main: {
      id: "to_main",
      say: "Go to {{water_main.location}}. {{water_main.access_notes}} Turn the lever clockwise until it stops. Tell me when it's done.",
      expect: "confirm",
      next: "check_main",
      requires: "water_main",
      missingTarget: "no_record",
    },
    check_main: {
      id: "check_main",
      say: "Is the water stopped now?",
      expect: "choice",
      choices: [
        { label: "yes", next: "done" },
        { label: "no", next: "call_pro" },
      ],
    },
    call_pro: {
      id: "call_pro",
      say: "Stop and call a plumber now. I've saved this incident with everything you've told me, so you won't have to explain it twice.",
      expect: "confirm",
      next: "close",
    },
    no_record: {
      id: "no_record",
      say: "I don't have a verified main shutoff location for this house, and I won't guess. Call your water utility or a plumber now. Once this is over, record the shutoff so I can walk you through it next time.",
      expect: "confirm",
      next: "close",
    },
    done: {
      id: "done",
      say: "Good. Take photos of the damage before you clean anything up — you'll need them if you claim. I've logged this incident.",
      expect: "confirm",
      next: "close",
    },
    close: {
      id: "close",
      say: "I'll keep this incident open until you tell me it's resolved.",
      expect: "confirm",
      terminal: true,
    },
  },
};
