import mongoose, { Schema } from "mongoose";

export type FormTemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface IFormTemplate {
  tenant_id: mongoose.Types.ObjectId;
  templateId: string;
  formKey: string;
  status: FormTemplateStatus;
  version: number;
  updatedAt: Date;
  definition: Record<string, unknown>;
  compiled?: Record<string, unknown> | null;
}

const formTemplateSchema = new Schema<IFormTemplate>(
  {
    tenant_id: { type: Schema.Types.ObjectId, required: true, index: true },
    templateId: { type: String, required: true },
    formKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "ARCHIVED"],
      required: true,
    },
    version: { type: Number, required: true, min: 1 },
    definition: { type: Schema.Types.Mixed, required: true },
    compiled: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: "updatedAt" } },
);

formTemplateSchema.index(
  { tenant_id: 1, templateId: 1 },
  { unique: true },
);
formTemplateSchema.index({ tenant_id: 1, formKey: 1, status: 1 });

export const FormTemplate =
  mongoose.models.FormTemplate ??
  mongoose.model<IFormTemplate>("FormTemplate", formTemplateSchema, "form_templates");
