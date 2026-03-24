import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { FormTemplate } from "../src/models/FormTemplate.js";
import { EmployeeRecord } from "../src/models/EmployeeRecord.js";
import { mongoConnectOptions } from "../src/lib/mongoConnectOptions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/blazeup_form_demo";
const SEED_TENANT_ID =
  process.env.SEED_TENANT_ID ?? "507f1f77bcf86cd799439011";

/** Order matters: formKeys match FE navigation/rendering. */
const TEMPLATE_FILES = [
  "employee-ui-template.example.json",
  "employee-ui-template.personal-information.json",
  "employee-ui-template.address.json",
] as const;

/** Log target without credentials so you can match Atlas vs local. */
function redactMongoUri(uri: string): string {
  if (uri.startsWith("mongodb+srv://")) {
    const rest = uri.slice("mongodb+srv://".length);
    const at = rest.indexOf("@");
    if (at !== -1) return `mongodb+srv://***@${rest.slice(at + 1)}`;
  }
  if (uri.startsWith("mongodb://")) {
    const rest = uri.slice("mongodb://".length);
    const at = rest.indexOf("@");
    if (at !== -1) return `mongodb://***@${rest.slice(at + 1)}`;
  }
  return uri;
}

function stripJsonCommentsKey(raw: Record<string, unknown>) {
  delete raw.$comment;
}

function resolveEmployeeJsonPath(): string {
  const fromEnv = process.env.SEED_EMPLOYEE_JSON?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const defaultPath = join(__dirname, "..", "data", "mockEmployeeV24Minh.json");
  if (existsSync(defaultPath)) return defaultPath;

  throw new Error(
    "Employee seed JSON not found. Set SEED_EMPLOYEE_JSON or add data/mockEmployeeV24Minh.json.",
  );
}

async function seed() {
  const employeePath = resolveEmployeeJsonPath();
  const employeeRaw = JSON.parse(readFileSync(employeePath, "utf-8")) as Record<
    string,
    unknown
  >;
  stripJsonCommentsKey(employeeRaw);

  const employee_id = String(employeeRaw.employee_id);
  if (!employee_id) {
    throw new Error("Employee JSON must include employee_id");
  }

  const record = { ...employeeRaw, tenant_id: SEED_TENANT_ID };

  if (!mongoose.Types.ObjectId.isValid(SEED_TENANT_ID)) {
    throw new Error("SEED_TENANT_ID must be a valid ObjectId hex string");
  }
  const tenant_id = new mongoose.Types.ObjectId(SEED_TENANT_ID);

  console.log(`Target: ${redactMongoUri(MONGODB_URI)}`);
  await mongoose.connect(MONGODB_URI, mongoConnectOptions());
  console.log(`Connected DB name: ${mongoose.connection.db?.databaseName ?? "?"}`);
  await FormTemplate.syncIndexes();
  await EmployeeRecord.syncIndexes();

  for (const fileName of TEMPLATE_FILES) {
    const templatePath = join(__dirname, "..", "data", fileName);
    if (!existsSync(templatePath)) {
      throw new Error(`Template file missing: ${templatePath}`);
    }
    const templateRaw = JSON.parse(readFileSync(templatePath, "utf-8")) as Record<
      string,
      unknown
    >;
    stripJsonCommentsKey(templateRaw);

    const templateId = String(templateRaw.templateId);
    const formKey = String(templateRaw.formKey);
    const version = Number(templateRaw.version);
    const status = String(templateRaw.status) as "DRAFT" | "ACTIVE" | "ARCHIVED";

    const definition = { ...templateRaw };
    delete definition.version;
    delete definition.status;
    delete definition.updatedAt;

    const removedTpl = await FormTemplate.deleteMany({ tenant_id, templateId });
    console.log(
      `Templates: removed ${removedTpl.deletedCount} row(s) tenant=${SEED_TENANT_ID} templateId=${templateId}.`,
    );

    const tplDoc = await FormTemplate.create({
      tenant_id,
      templateId,
      formKey,
      status,
      version,
      definition,
      compiled: null,
    });

    console.log(
      `Seeded form_templates: ${formKey} (${templateId}) ACTIVE v${version} _id=${String(tplDoc._id)}`,
    );
  }

  const tplRows = await FormTemplate.find({ tenant_id })
    .select("templateId formKey")
    .sort({ formKey: 1 })
    .lean();
  console.log(
    `Verify form_templates for tenant ${SEED_TENANT_ID}: ${tplRows.length} document(s).`,
  );
  for (const row of tplRows) {
    console.log(`  - formKey=${row.formKey} templateId=${row.templateId}`);
  }

  const removedEmp = await EmployeeRecord.deleteMany({ tenant_id, employee_id });
  console.log(
    `Employees: removed ${removedEmp.deletedCount} row(s) for tenant_id=${SEED_TENANT_ID} employee_id=${employee_id}.`,
  );

  const empDoc = await EmployeeRecord.create({
    tenant_id,
    employee_id,
    record,
  });

  console.log(`Seeded employees: ${employee_id}, _id=${String(empDoc._id)}`);
  console.log(`  Employee JSON: ${employeePath}`);
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
