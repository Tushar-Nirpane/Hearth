import { db } from "./db.js";

/** Idempotent: wipes and rewrites the two demo properties. */
export function seed(): void {

const DEMO_PROPERTY = "prop_alder";
const EMPTY_PROPERTY = "prop_canyon";

db.prepare("DELETE FROM service_records WHERE asset_id IN (SELECT id FROM assets WHERE property_id IN (?, ?))").run(
  DEMO_PROPERTY,
  EMPTY_PROPERTY,
);
db.prepare("DELETE FROM assets WHERE property_id IN (?, ?)").run(DEMO_PROPERTY, EMPTY_PROPERTY);
db.prepare("DELETE FROM utility_points WHERE property_id IN (?, ?)").run(DEMO_PROPERTY, EMPTY_PROPERTY);
db.prepare("DELETE FROM properties WHERE id IN (?, ?)").run(DEMO_PROPERTY, EMPTY_PROPERTY);

db.prepare("INSERT INTO properties (id, address, year_built) VALUES (?, ?, ?)").run(
  DEMO_PROPERTY,
  "1427 Alder Street",
  1962,
);
db.prepare("INSERT INTO properties (id, address, year_built) VALUES (?, ?, ?)").run(
  EMPTY_PROPERTY,
  "88 Canyon Road",
  2019,
);

const points = [
  [
    "up_water",
    DEMO_PROPERTY,
    "water_main",
    "Basement, left of the furnace",
    "Behind the white access panel. It's a lever, not a wheel. Turn clockwise.",
    1,
    "owner_recorded",
    0.95,
  ],
  [
    "up_gas",
    DEMO_PROPERTY,
    "gas_meter",
    "Outside, east wall",
    "Next to the AC condenser. Quarter-turn valve directly above the meter.",
    1,
    "owner_recorded",
    0.9,
  ],
  [
    "up_panel",
    DEMO_PROPERTY,
    "electrical_panel",
    "Garage, right of the door",
    "Main breaker is top-center, labeled MAIN. Pull down firmly.",
    1,
    "realtor_handover",
    0.9,
  ],
] as const;

const insertPoint = db.prepare(
  `INSERT INTO utility_points (id, property_id, kind, location, access_notes, verified, source, confidence)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
for (const p of points) insertPoint.run(...p);

const insertAsset = db.prepare(
  `INSERT INTO assets (id, property_id, name, make, model, serial, location, warranty_ends_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
insertAsset.run(
  "as_dishwasher",
  DEMO_PROPERTY,
  "Dishwasher",
  "Bosch",
  "SHX78CM5N",
  "SN-4471-882",
  "Kitchen",
  "2027-03-14",
);
insertAsset.run(
  "as_boiler",
  DEMO_PROPERTY,
  "Boiler",
  "Weil-McLain",
  "CGa-5",
  "WM-2291",
  "Basement",
  null,
);
insertAsset.run(
  "as_fridge",
  DEMO_PROPERTY,
  "Refrigerator",
  "LG",
  "LRFXS2503S",
  "LG-77120",
  "Kitchen",
  "2028-06-30",
);
insertAsset.run(
  "as_furnace",
  DEMO_PROPERTY,
  "Furnace",
  "Trane",
  "XR95",
  "TR-90412",
  "Basement",
  "2029-01-15",
);
insertAsset.run(
  "as_water_heater",
  DEMO_PROPERTY,
  "Water Heater",
  "Rheem",
  "Performance Platinum",
  "RH-88310",
  "Basement",
  "2028-10-20",
);
insertAsset.run(
  "as_sump_pump",
  DEMO_PROPERTY,
  "Sump Pump",
  "Wayne",
  "CDU980",
  "WN-5542",
  "Basement",
  "2027-05-11",
);

const insertService = db.prepare(
  `INSERT INTO service_records (id, asset_id, performed_at, vendor, notes) VALUES (?, ?, ?, ?, ?)`,
);
insertService.run(
  "sr_1",
  "as_dishwasher",
  "2025-11-02",
  "Northside Appliance",
  "Supply line replaced under warranty. No charge.",
);
insertService.run(
  "sr_2",
  "as_boiler",
  "2026-03-02",
  "Cedar Heating",
  "Annual service. Replaced thermocouple. System holds pressure.",
);
insertService.run(
  "sr_3",
  "as_furnace",
  "2025-09-15",
  "Cedar Heating",
  "Pre-winter burner inspection and filter replacement.",
);
insertService.run(
  "sr_4",
  "as_water_heater",
  "2026-01-10",
  "Apex Plumbing",
  "Flushed tank sediment and inspected pressure relief valve.",
);

  console.log(`Seeded ${DEMO_PROPERTY} (full record) and ${EMPTY_PROPERTY} (empty, for refusal tests).`);
}

import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
}

