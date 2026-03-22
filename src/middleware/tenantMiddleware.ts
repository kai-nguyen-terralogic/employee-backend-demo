import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

export type TenantRequest = Request & { tenantId?: mongoose.Types.ObjectId };

export function tenantMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.header("X-Tenant-Id")?.trim();
  if (!raw) {
    res.status(400).json({ error: "Missing X-Tenant-Id header" });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    res.status(400).json({ error: "X-Tenant-Id must be a valid ObjectId hex string" });
    return;
  }
  req.tenantId = new mongoose.Types.ObjectId(raw);
  next();
}
