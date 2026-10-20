// Core domain types for Hearth.
// Rule: a shutoff is only returned to a caller when `verified` is true.

export type UtilityKind = "water_main" | "gas_meter" | "electrical_panel";
export type EmergencyType = "water" | "gas" | "electric" | "hvac";
export type RunbookStatus = "active" | "completed" | "escalated" | "abandoned";

export interface UtilityPoint {
  id: string;
  propertyId: string;
  kind: UtilityKind;
  location: string;
  accessNotes: string | null;
  verified: boolean;
  source: "owner_recorded" | "realtor_handover" | "inferred";
  confidence: number;
}

export interface Property {
  id: string;
  address: string;
  yearBuilt: number | null;
  utilityPoints: UtilityPoint[];
}

export interface ServiceRecord {
  id: string;
  performedAt: string;
  vendor: string;
  notes: string;
}

export interface Asset {
  id: string;
  propertyId: string;
  name: string;
  make: string | null;
  model: string | null;
  serial: string | null;
  location: string | null;
  warrantyEndsAt: string | null;
  serviceHistory: ServiceRecord[];
}

export interface Step {
  id: string;
  say: string;
  expect: "confirm" | "choice";
  choices?: Array<{ label: string; next: string }>;
  next?: string;
  /** If set, the step needs a verified utility point of this kind. */
  requires?: UtilityKind;
  /** Step to jump to when `requires` is missing or unverified. */
  missingTarget?: string;
  /** Marks the end of the flow. */
  terminal?: boolean;
}

export interface Runbook {
  id: string;
  emergencyType: EmergencyType;
  title: string;
  start: string;
  steps: Record<string, Step>;
}

export interface RunbookSession {
  id: string;
  propertyId: string;
  emergencyType: EmergencyType;
  stepId: string;
  answers: Record<string, string>;
  status: RunbookStatus;
  startedAt: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  propertyId: string;
  type: EmergencyType;
  startedAt: string;
  status: "open" | "resolved";
  sessionId: string | null;
  summary: string;
  stepsTaken: Array<{ stepId: string; at: string; answer: string | null }>;
  assetsInvolved: string[];
}
