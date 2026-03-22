import mongoose, { Schema } from "mongoose";

/** Canonical employee payload (demo) — separate from form_templates. */
export interface IEmployeeRecord {
  tenant_id: mongoose.Types.ObjectId;
  employee_id: string;
  record: Record<string, unknown>;
  updatedAt: Date;
}

const employeeRecordSchema = new Schema<IEmployeeRecord>(
  {
    tenant_id: { type: Schema.Types.ObjectId, required: true, index: true },
    employee_id: { type: String, required: true },
    record: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: "updatedAt" } },
);

employeeRecordSchema.index({ tenant_id: 1, employee_id: 1 }, { unique: true });

export const EmployeeRecord =
  mongoose.models.EmployeeRecord ??
  mongoose.model<IEmployeeRecord>("EmployeeRecord", employeeRecordSchema, "employees");
