import Database from "better-sqlite3";
import path from "node:path";
import type {
  Asset,
  Incident,
  Property,
  RunbookSession,
  ServiceRecord,
  UtilityKind,
  UtilityPoint,
} from "./types.js";

const DB_PATH = process.env.HEARTH_DB ?? path.join(process.cwd(), "hearth.db");
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  year_built INTEGER
);

CREATE TABLE IF NOT EXISTS utility_points (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  location TEXT NOT NULL,
  access_notes TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  serial TEXT,
  location TEXT,
  warranty_ends_at TEXT
);

CREATE TABLE IF NOT EXISTS service_records (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  performed_at TEXT NOT NULL,
  vendor TEXT NOT NULL,
  notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runbook_sessions (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  emergency_type TEXT NOT NULL,
  step_id TEXT NOT NULL,
  answers TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  status TEXT NOT NULL,
  session_id TEXT,
  summary TEXT NOT NULL,
  steps_taken TEXT NOT NULL,
  assets_involved TEXT NOT NULL
);
`);

export function getProperty(id: string): Property | null {
  const row = db.prepare("SELECT * FROM properties WHERE id = ?").get(id) as
    | { id: string; address: string; year_built: number | null }
    | undefined;
  if (!row) return null;
  const points = db
    .prepare("SELECT * FROM utility_points WHERE property_id = ?")
    .all(id) as Array<Record<string, unknown>>;
  return {
    id: row.id,
    address: row.address,
    yearBuilt: row.year_built,
    utilityPoints: points.map((p) => ({
      id: String(p.id),
      propertyId: String(p.property_id),
      kind: String(p.kind) as UtilityKind,
      location: String(p.location),
      accessNotes: (p.access_notes as string | null) ?? null,
      verified: Number(p.verified) === 1,
      source: String(p.source) as UtilityPoint["source"],
      confidence: Number(p.confidence),
    })),
  };
}

/** Verified-only lookup. This function is the product's credibility boundary. */
export function findVerifiedPoint(
  propertyId: string,
  kind: UtilityKind,
): UtilityPoint | null {
  const row = db
    .prepare(
      "SELECT * FROM utility_points WHERE property_id = ? AND kind = ? AND verified = 1 LIMIT 1",
    )
    .get(propertyId, kind) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    kind: String(row.kind) as UtilityKind,
    location: String(row.location),
    accessNotes: (row.access_notes as string | null) ?? null,
    verified: true,
    source: String(row.source) as UtilityPoint["source"],
    confidence: Number(row.confidence),
  };
}

export function getAsset(propertyId: string, query: string): Asset | null {
  const like = `%${query.toLowerCase()}%`;
  const row = db
    .prepare(
      `SELECT * FROM assets
       WHERE property_id = ?
         AND (lower(name) LIKE ? OR lower(make) LIKE ? OR lower(model) LIKE ? OR lower(location) LIKE ?)
       ORDER BY name LIMIT 1`,
    )
    .get(propertyId, like, like, like, like) as Record<string, unknown> | undefined;
  if (!row) return null;
  const services = db
    .prepare("SELECT * FROM service_records WHERE asset_id = ? ORDER BY performed_at DESC")
    .all(String(row.id)) as Array<Record<string, unknown>>;
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    name: String(row.name),
    make: (row.make as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serial: (row.serial as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    warrantyEndsAt: (row.warranty_ends_at as string | null) ?? null,
    serviceHistory: services.map(
      (s): ServiceRecord => ({
        id: String(s.id),
        performedAt: String(s.performed_at),
        vendor: String(s.vendor),
        notes: String(s.notes),
      }),
    ),
  };
}

export function createSession(session: RunbookSession): void {
  db.prepare(
    `INSERT INTO runbook_sessions
     (id, property_id, emergency_type, step_id, answers, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.propertyId,
    session.emergencyType,
    session.stepId,
    JSON.stringify(session.answers),
    session.status,
    session.startedAt,
    session.updatedAt,
  );
}

export function getSession(id: string): RunbookSession | null {
  const row = db.prepare("SELECT * FROM runbook_sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    emergencyType: String(row.emergency_type) as RunbookSession["emergencyType"],
    stepId: String(row.step_id),
    answers: JSON.parse(String(row.answers)),
    status: String(row.status) as RunbookSession["status"],
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
  };
}

export function updateSession(session: RunbookSession): void {
  db.prepare(
    `UPDATE runbook_sessions
     SET step_id = ?, answers = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    session.stepId,
    JSON.stringify(session.answers),
    session.status,
    session.updatedAt,
    session.id,
  );
}

export function createIncident(incident: Incident): void {
  db.prepare(
    `INSERT INTO incidents
     (id, property_id, type, started_at, status, session_id, summary, steps_taken, assets_involved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    incident.id,
    incident.propertyId,
    incident.type,
    incident.startedAt,
    incident.status,
    incident.sessionId,
    incident.summary,
    JSON.stringify(incident.stepsTaken),
    JSON.stringify(incident.assetsInvolved),
  );
}

export function getIncident(id: string): Incident | null {
  const row = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    type: String(row.type) as Incident["type"],
    startedAt: String(row.started_at),
    status: String(row.status) as Incident["status"],
    sessionId: (row.session_id as string | null) ?? null,
    summary: String(row.summary),
    stepsTaken: JSON.parse(String(row.steps_taken)),
    assetsInvolved: JSON.parse(String(row.assets_involved)),
  };
}

export function updateIncident(incident: Incident): void {
  db.prepare(
    `UPDATE incidents
     SET status = ?, summary = ?, steps_taken = ?, assets_involved = ?
     WHERE id = ?`,
  ).run(
    incident.status,
    incident.summary,
    JSON.stringify(incident.stepsTaken),
    JSON.stringify(incident.assetsInvolved),
    incident.id,
  );
}

export function getIncidentBySession(sessionId: string): Incident | null {
  const row = db
    .prepare("SELECT id FROM incidents WHERE session_id = ? LIMIT 1")
    .get(sessionId) as { id: string } | undefined;
  return row ? getIncident(row.id) : null;
}
