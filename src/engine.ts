import { randomUUID } from "node:crypto";
import {
  createIncident,
  createSession,
  findVerifiedPoint,
  getIncidentBySession,
  getProperty,
  getSession,
  updateIncident,
  updateSession,
} from "./db.js";
import { waterRunbook } from "./runbooks/water.js";
import { gasRunbook } from "./runbooks/gas.js";
import type {
  EmergencyType,
  Incident,
  Property,
  Runbook,
  RunbookSession,
  Step,
  UtilityKind,
} from "./types.js";

const RUNBOOKS: Record<string, Runbook> = {
  water: waterRunbook,
  gas: gasRunbook,
};

const AFFIRMATIVE =
  /^(yes|yeah|yep|yup|done|ok|okay|it'?s done|finished|stopped|it stopped|clear|outside|called|did it)\b/i;
const NEGATIVE = /^(no|nope|not yet|still|hasn'?t|has not|didn'?t)\b/i;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface Turn {
  sessionId: string;
  incidentId: string;
  status: RunbookSession["status"];
  stepId: string;
  say: string;
  expect: Step["expect"];
  choices?: string[];
  done: boolean;
}

function runbookFor(type: EmergencyType): Runbook | null {
  return RUNBOOKS[type] ?? null;
}

function render(text: string, property: Property): string {
  return text.replace(/\{\{(\w+)_(location|access_notes)\}\}/g, (_m, kind: string, field: string) => {
    const point = findVerifiedPoint(property.id, kind as UtilityKind);
    if (!point) return "";
    const value = field === "location" ? point.location : point.accessNotes;
    return value ?? "";
  }).replace(/\s{2,}/g, " ").trim();
}

function enterStep(
  runbook: Runbook,
  stepId: string,
  property: Property,
): { step: Step; status: RunbookSession["status"] } {
  let step = runbook.steps[stepId];
  if (!step) throw new Error(`Unknown step ${stepId} in ${runbook.id}`);

  if (step.requires) {
    const point = findVerifiedPoint(property.id, step.requires);
    if (!point || point.confidence < 0.5) {
      step = runbook.steps[step.missingTarget ?? step.id];
    }
  }
  return { step, status: step.terminal ? "completed" : "active" };
}

function matchChoice(step: Step, answer: string): string | null {
  const normalized = normalize(answer);
  if (step.expect === "confirm") {
    return NEGATIVE.test(normalized) ? null : (step.next ?? null);
  }
  const choices = step.choices ?? [];

  for (const choice of choices) {
    if (normalized.includes(normalize(choice.label))) return choice.next;
  }

  // Token coverage: "under the sink" should match the label "under a sink".
  let best: { next: string; score: number } | null = null;
  for (const choice of choices) {
    const tokens = normalize(choice.label)
      .split(" ")
      .filter((token) => token.length > 2);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((token) => normalized.includes(token)).length;
    const score = hits / tokens.length;
    if (!best || score > best.score) best = { next: choice.next, score };
  }
  if (best && best.score >= 1) return best.next;

  if (AFFIRMATIVE.test(normalized)) {
    const yes = choices.find((c) => /^yes/.test(normalize(c.label)));
    if (yes) return yes.next;
  }
  if (NEGATIVE.test(normalized)) {
    const no = choices.find((c) => /^no/.test(normalize(c.label)));
    if (no) return no.next;
  }
  return null;
}

export function startRunbook(propertyId: string, type: EmergencyType): Turn {
  const property = getProperty(propertyId);
  if (!property) throw new Error("property_not_found");
  const runbook = runbookFor(type);
  if (!runbook) throw new Error("runbook_not_available");

  const now = new Date().toISOString();
  const session: RunbookSession = {
    id: randomUUID(),
    propertyId,
    emergencyType: type,
    stepId: runbook.start,
    answers: {},
    status: "active",
    startedAt: now,
    updatedAt: now,
  };

  const { step, status } = enterStep(runbook, runbook.start, property);
  session.stepId = step.id;
  session.status = status;
  createSession(session);

  const incident: Incident = {
    id: randomUUID(),
    propertyId,
    type,
    startedAt: now,
    status: "open",
    sessionId: session.id,
    summary: `${runbook.title} reported`,
    stepsTaken: [{ stepId: step.id, at: now, answer: null }],
    assetsInvolved: [],
  };
  createIncident(incident);

  return turn(session, incident.id, step, property);
}

export function answerRunbook(sessionId: string, answer: string): Turn {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  if (session.status !== "active") throw new Error("session_not_active");

  const runbook = runbookFor(session.emergencyType);
  if (!runbook) throw new Error("runbook_not_available");
  const property = getProperty(session.propertyId);
  if (!property) throw new Error("property_not_found");
  const incident = getIncidentBySession(sessionId);

  const current = runbook.steps[session.stepId];
  const nextId = matchChoice(current, answer);

  // Unrecognised answer: stay put and repeat the instruction, never advance blindly.
  if (!nextId) {
    return turn(session, incident?.id ?? "", current, property, true);
  }

  session.answers[current.id] = answer;
  session.updatedAt = new Date().toISOString();

  const { step, status } = enterStep(runbook, nextId, property);
  session.stepId = step.id;
  session.status = status;
  updateSession(session);

  if (incident) {
    incident.stepsTaken.push({
      stepId: step.id,
      at: new Date().toISOString(),
      answer: answer,
    });
    if (status === "completed") {
      incident.summary = `${runbook.title}: flow completed`;
    }
    updateIncident(incident);
  }

  return turn(session, incident?.id ?? "", step, property);
}

export function resumeRunbook(sessionId: string): Turn {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const runbook = runbookFor(session.emergencyType);
  if (!runbook) throw new Error("runbook_not_available");
  const property = getProperty(session.propertyId);
  if (!property) throw new Error("property_not_found");
  const incident = getIncidentBySession(sessionId);
  const step = runbook.steps[session.stepId];
  return turn(session, incident?.id ?? "", step, property);
}

function turn(
  session: RunbookSession,
  incidentId: string,
  step: Step,
  property: Property,
  repeat = false,
): Turn {
  const say = render(step.say, property);
  return {
    sessionId: session.id,
    incidentId,
    status: session.status,
    stepId: step.id,
    say: repeat ? `I didn't catch that. ${say}` : say,
    expect: step.expect,
    choices: step.choices?.map((c) => c.label),
    done: step.terminal === true,
  };
}
