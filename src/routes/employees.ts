import { Router, type Response } from "express";
import { z } from "zod";
import type { TenantRequest } from "../middleware/tenantMiddleware.js";
import { EmployeeRecord, type IEmployeeRecord } from "../models/EmployeeRecord.js";

const router = Router();

/** Full employee JSON from the client; backend persists as-is (after identity guardrails). */
const putEmployeeBodySchema = z.object({
  employee: z
    .record(z.string(), z.any())
    .refine((o) => Object.keys(o).length > 0, "employee must not be empty"),
});

/** Demo: list business employee_ids for this tenant. */
router.get("/", async (req: TenantRequest, res: Response) => {
  const tenant_id = req.tenantId!;
  const rows = await EmployeeRecord.find({ tenant_id })
    .select("employee_id updatedAt")
    .sort({ employee_id: 1 })
    .lean();

  res.json({
    items: rows.map((r) => ({
      employee_id: r.employee_id,
      updatedAt: (r.updatedAt as Date).toISOString(),
    })),
  });
});

/** Demo: one canonical employee record (shape aligned with submit contract `employee`). */
router.get("/:employeeId", async (req: TenantRequest, res: Response) => {
  const tenant_id = req.tenantId!;
  const employee_id = req.params.employeeId;
  if (!employee_id) {
    res.status(400).json({ error: "employeeId is required" });
    return;
  }

  const doc = (await EmployeeRecord.findOne({ tenant_id, employee_id })
    .lean()
    .exec()) as (IEmployeeRecord & { _id: unknown }) | null;
  if (!doc) {
    res.status(404).json({ error: "Employee not found for this tenant" });
    return;
  }

  res.json({
    employee_id: doc.employee_id,
    updatedAt: doc.updatedAt.toISOString(),
    employee: doc.record,
  });
});

/**
 * Replace stored employee payload with the object from the client (e.g. full form state).
 * `employee_id` and `tenant_id` are forced from the URL / header so the client cannot repoint the row.
 */
router.put("/:employeeId", async (req: TenantRequest, res: Response) => {
  const tenant_id = req.tenantId!;
  const employee_id = req.params.employeeId;
  if (!employee_id) {
    res.status(400).json({ error: "employeeId is required" });
    return;
  }

  const parsed = putEmployeeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const doc = await EmployeeRecord.findOne({ tenant_id, employee_id });
  if (!doc) {
    res.status(404).json({ error: "Employee not found for this tenant" });
    return;
  }

  const record: Record<string, unknown> = {
    ...parsed.data.employee,
    employee_id,
    tenant_id: tenant_id.toString(),
  };

  doc.record = record;
  doc.markModified("record");
  await doc.save();

  res.json({
    employee_id: doc.employee_id,
    updatedAt: doc.updatedAt.toISOString(),
    employee: doc.record,
  });
});

router.post("/", (_req, res) => {
  res.status(501).json({
    error: "Not implemented in demo",
    hint: "See employee-template-api-contracts.md for the expected submit payload.",
  });
});

export default router;
