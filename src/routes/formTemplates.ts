import { Router, type Response } from "express";
import { z } from "zod";
import type { TenantRequest } from "../middleware/tenantMiddleware.js";
import { FormTemplate, type IFormTemplate } from "../models/FormTemplate.js";

const router = Router();

const templateBodySchema = z
  .object({
    templateId: z.string().min(1),
    moduleKey: z.string().min(1),
    formKey: z.string().min(1),
    name: z.string().min(1),
    version: z.number().int().nonnegative(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    sourceSchemaVersion: z.string().min(1),
    updatedAt: z.string().optional(),
    layoutConstraints: z.record(z.string(), z.unknown()).optional(),
    sections: z.array(z.unknown()),
    fields: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const putBodySchema = z.object({
  version: z.number().int().nonnegative(),
  template: templateBodySchema,
});

const publishBodySchema = z.object({
  version: z.number().int().positive(),
});

function buildTemplateResponse(doc: {
  templateId: string;
  formKey: string;
  status: string;
  version: number;
  updatedAt: Date;
  definition: Record<string, unknown>;
  compiled?: unknown;
}) {
  const updatedAt = doc.updatedAt.toISOString();
  return {
    version: doc.version,
    updatedAt,
    templateId: doc.templateId,
    template: {
      ...doc.definition,
      templateId: doc.templateId,
      formKey: doc.formKey,
      version: doc.version,
      status: doc.status,
      updatedAt,
    },
    compiled: doc.compiled ?? null,
  };
}

function putSummary(doc: {
  templateId: string;
  version: number;
  status: string;
  updatedAt: Date;
}) {
  return {
    version: doc.version,
    updatedAt: doc.updatedAt.toISOString(),
    template: {
      templateId: doc.templateId,
      version: doc.version,
      status: doc.status,
    },
  };
}

/**
 * All ACTIVE templates for the tenant (one entry per `formKey`: newest `updatedAt` wins if duplicates exist).
 */
router.get("/active/all", async (req: TenantRequest, res: Response) => {
  const tenant_id = req.tenantId!;

  const docs = (await FormTemplate.find({ tenant_id, status: "ACTIVE" })
    .sort({ updatedAt: -1 })
    .lean()
    .exec()) as unknown as (IFormTemplate & { _id: unknown })[];

  const byFormKey = new Map<string, (typeof docs)[number]>();
  for (const doc of docs) {
    if (!byFormKey.has(doc.formKey)) {
      byFormKey.set(doc.formKey, doc);
    }
  }

  const unique = [...byFormKey.values()].sort((a, b) =>
    a.formKey.localeCompare(b.formKey),
  );

  const items = unique.map((doc) =>
    buildTemplateResponse({
      templateId: doc.templateId,
      formKey: doc.formKey,
      status: doc.status,
      version: doc.version,
      updatedAt: doc.updatedAt,
      definition: doc.definition as Record<string, unknown>,
      compiled: doc.compiled,
    }),
  );

  res.json({ items });
});

router.get("/active", async (req: TenantRequest, res: Response) => {
  const parsed = z.object({ formKey: z.string().min(1) }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "formKey query parameter is required" });
    return;
  }
  const { formKey } = parsed.data;
  const tenant_id = req.tenantId!;

  const doc = (await FormTemplate.findOne({
    tenant_id,
    formKey,
    status: "ACTIVE",
  })
    .sort({ updatedAt: -1 })
    .lean()
    .exec()) as (IFormTemplate & { _id: unknown }) | null;

  if (!doc) {
    res.status(404).json({ error: "No ACTIVE template for this tenant and formKey" });
    return;
  }

  res.json(
    buildTemplateResponse({
      templateId: doc.templateId,
      formKey: doc.formKey,
      status: doc.status,
      version: doc.version,
      updatedAt: doc.updatedAt,
      definition: doc.definition as Record<string, unknown>,
      compiled: doc.compiled,
    }),
  );
});

router.put("/:templateId", async (req: TenantRequest, res: Response) => {
  const templateId = req.params.templateId;
  if (!templateId) {
    res.status(400).json({ error: "templateId is required" });
    return;
  }

  const bodyResult = putBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "Invalid body", details: bodyResult.error.flatten() });
    return;
  }
  const { version: clientVersion, template: tpl } = bodyResult.data;
  if (tpl.templateId !== templateId) {
    res.status(400).json({ error: "template.templateId must match URL templateId" });
    return;
  }

  const tenant_id = req.tenantId!;

  const existing = await FormTemplate.findOne({ tenant_id, templateId });

  if (!existing) {
    if (clientVersion !== 0) {
      res
        .status(400)
        .json({ error: "Creating a new template requires body.version === 0" });
      return;
    }
    const definition = { ...tpl } as Record<string, unknown>;
    delete definition.version;
    delete definition.status;
    delete definition.updatedAt;

    const created = await FormTemplate.create({
      tenant_id,
      templateId,
      formKey: tpl.formKey,
      status: tpl.status === "ACTIVE" ? "DRAFT" : tpl.status,
      version: 1,
      definition,
      compiled: null,
    });

    res.json(putSummary(created));
    return;
  }

  if (clientVersion !== existing.version) {
    res.status(409).json({
      error: "Version conflict",
      expectedVersion: existing.version,
    });
    return;
  }

  const definition = { ...tpl } as Record<string, unknown>;
  delete definition.version;
  delete definition.status;
  delete definition.updatedAt;

  existing.formKey = tpl.formKey;
  existing.definition = definition;
  existing.status = tpl.status;
  existing.version = existing.version + 1;
  await existing.save();

  res.json(putSummary(existing));
});

router.post("/:templateId/publish", async (req: TenantRequest, res: Response) => {
  const templateId = req.params.templateId;
  const bodyResult = publishBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "Invalid body", details: bodyResult.error.flatten() });
    return;
  }
  const { version: clientVersion } = bodyResult.data;
  const tenant_id = req.tenantId!;

  const doc = await FormTemplate.findOne({ tenant_id, templateId });
  if (!doc) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (clientVersion !== doc.version) {
    res.status(409).json({
      error: "Version conflict",
      expectedVersion: doc.version,
    });
    return;
  }
  if (doc.status !== "DRAFT") {
    res.status(400).json({ error: "Only DRAFT templates can be published" });
    return;
  }

  await FormTemplate.updateMany(
    { tenant_id, formKey: doc.formKey, status: "ACTIVE" },
    { $set: { status: "ARCHIVED" } },
  );

  doc.status = "ACTIVE";
  doc.version = doc.version + 1;
  await doc.save();

  res.json({
    version: doc.version,
    updatedAt: doc.updatedAt.toISOString(),
    status: doc.status,
    template: {
      templateId: doc.templateId,
      version: doc.version,
      status: doc.status,
    },
  });
});

export default router;
