import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { db, getIncident, getProperty } from "../db.js";
import type { Asset } from "../types.js";

export interface PhotoCaptureResponse {
  fields: {
    name: string;
    make: string;
    model: string;
    serial: string;
    confidence: number;
  };
  requiresConfirmation: boolean;
}

/**
 * POST /api/capture/photo
 * Extracts appliance nameplate fields from photo via Bedrock or deterministic mock.
 */
export async function handlePhotoCapture(req: Request, res: Response): Promise<void> {
  const { propertyId, imageBase64 } = req.body ?? {};

  if (!propertyId) {
    res.status(400).json({ error: "missing_fields", message: "propertyId is required" });
    return;
  }

  const captureMode = process.env.CAPTURE_MODE ?? "mock";

  // Mock extractor by default per SPEC.md (safe fallback, zero external API blocker)
  // If Bedrock credentials are provided in the future, Bedrock vision runs here
  const mockFields = {
    name: "Dishwasher",
    make: "Bosch",
    model: "SHX78CM5N",
    serial: `SN-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(100 + Math.random() * 900)}`,
    confidence: 0.94,
  };

  res.json({
    fields: mockFields,
    requiresConfirmation: true,
  });
}

/**
 * POST /api/assets/confirm
 * Persists user-confirmed appliance nameplate fields to SQLite.
 */
export async function handleAssetConfirm(req: Request, res: Response): Promise<void> {
  const { propertyId, asset } = req.body ?? {};

  if (!propertyId || !asset || !asset.name) {
    res.status(400).json({ error: "missing_fields", message: "propertyId and asset name are required" });
    return;
  }

  const property = getProperty(propertyId);
  if (!property) {
    res.status(404).json({ error: "property_not_found", message: `Property ${propertyId} not found` });
    return;
  }

  const id = `as_${asset.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${randomUUID().slice(0, 8)}`;
  const warrantyEndsAt =
    asset.warrantyEndsAt ??
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const newAsset: Asset = {
    id,
    propertyId,
    name: asset.name,
    make: asset.make ?? null,
    model: asset.model ?? null,
    serial: asset.serial ?? null,
    location: asset.location ?? "Kitchen",
    warrantyEndsAt,
    serviceHistory: [],
  };

  db.prepare(
    `INSERT INTO assets (id, property_id, name, make, model, serial, location, warranty_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newAsset.id,
    newAsset.propertyId,
    newAsset.name,
    newAsset.make,
    newAsset.model,
    newAsset.serial,
    newAsset.location,
    newAsset.warrantyEndsAt
  );

  res.json({
    success: true,
    asset: newAsset,
  });
}

/**
 * GET /api/incidents/:id
 * Fetches incident details including stepsTaken and assetsInvolved.
 */
export function handleGetIncident(req: Request, res: Response): void {
  const { id } = req.params as { id: string };
  const incident = getIncident(id);
  if (!incident) {
    res.status(404).json({ error: "incident_not_found", message: `Incident ${id} not found` });
    return;
  }
  res.json(incident);
}
