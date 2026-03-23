# employee-backend-demo

Demo API for **EmployeeUiTemplate** storage on MongoDB, aligned with [employee-template-api-contracts.md](../form-builder-document/employee-template-api-contracts.md) (Phase 1).

- **Stack:** Node.js 20+, Express, Mongoose, Zod, `X-Tenant-Id` header (ObjectId) instead of JWT.
- **Collections:** `form_templates` (layout only; `compiled` is `null` in seed) and `employees` (canonical employee payload per `tenant_id` + `employee_id`).
- **Separation:** Template config is tenant-wide; employee data is loaded separately (see `GET /api/employees/...`). Field-to-profile mapping is handled in the frontend, so backend templates/seed data do not include `canonicalPath`.

## Prerequisites

- Docker (for MongoDB) or any MongoDB 7+ instance
- Node.js 20+

## Setup

1. Start MongoDB:

   ```bash
   docker compose up -d
   ```

2. Copy environment file and adjust if needed:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create indexes and seed **template + demo employee**:

   ```bash
   npm run seed
   ```

   Optional env:

   - `SEED_TENANT_ID` — ObjectId hex (default `507f1f77bcf86cd799439011`). Stored on both collections; `record.tenant_id` inside the employee JSON is overwritten to this value for a single demo tenant.
   - `SEED_EMPLOYEE_JSON` — optional path to a canonical employee JSON file (default: [data/mockEmployeeV24Minh.json](data/mockEmployeeV24Minh.json)).

5. Run the server:

   ```bash
   npm run dev
   ```

   Or build and run: `npm run build && npm start`.

## API

All form-template routes require header **`X-Tenant-Id`**: a valid MongoDB **ObjectId** string (same value as used for `npm run seed`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/form-templates/employee-management/active/all` | **All** ACTIVE templates for the tenant. Response `{ items: [...] }` — each element matches the single-template shape below. One row per `formKey` (newest `updatedAt` if duplicates). |
| GET | `/api/form-templates/employee-management/active?formKey=...` | Latest **ACTIVE** template for that `formKey` (`template` + `compiled` usually `null`). Seed includes **`employee-information`** and **`personal-information`**. |
| PUT | `/api/form-templates/employee-management/:templateId` | Upsert draft; body `{ version, template }`. New doc: `version` must be **0**. Mismatch → **409** |
| POST | `/api/form-templates/employee-management/:templateId/publish` | Body `{ version }`; **DRAFT** → **ACTIVE**, other **ACTIVE** rows for same `(tenant_id, formKey)` → **ARCHIVED** |
| GET | `/api/employees` | Demo: list `employee_id` values for the tenant |
| GET | `/api/employees/:employeeId` | Demo: canonical employee body (e.g. `EMP-1042`) |
| PUT | `/api/employees/:employeeId` | Demo: save full **`employee`** object from the client; body `{ "employee": { ... } }`. Server overwrites stored record and forces `employee_id` + `tenant_id` from URL / header |
| POST | `/api/employees` | **501** stub (submit contract; not implemented) |

## Example curl

```bash
TENANT=507f1f77bcf86cd799439011
BASE=http://localhost:3000

curl -s -H "X-Tenant-Id: $TENANT" \
  "$BASE/api/form-templates/employee-management/active?formKey=employee-information"

curl -s -H "X-Tenant-Id: $TENANT" \
  "$BASE/api/form-templates/employee-management/active?formKey=personal-information"

curl -s -H "X-Tenant-Id: $TENANT" \
  "$BASE/api/form-templates/employee-management/active/all"

curl -s -H "X-Tenant-Id: $TENANT" "$BASE/api/employees"

curl -s -H "X-Tenant-Id: $TENANT" "$BASE/api/employees/EMP-1042"

# Save: GET employee → edit in UI → PUT entire `employee` object back
# body.json shape: { "employee": { ...same shape as GET response field `employee`... } }
curl -s -X PUT -H "Content-Type: application/json" -H "X-Tenant-Id: $TENANT" \
  "$BASE/api/employees/EMP-1042" -d @body.json
```

## Publish flow (quick test)

1. `GET` active → note `version` and full `template`.
2. `PUT` same `templateId` with `version` from step 1, `template.status` = `DRAFT`, and your edits.
3. `POST` `.../publish` with `version` returned from step 2.

## Data

- **Templates** — Seed loads two ACTIVE definitions (same tenant): [data/employee-ui-template.example.json](data/employee-ui-template.example.json) (`formKey`: **`employee-information`**) and [data/employee-ui-template.personal-information.json](data/employee-ui-template.personal-information.json) (`formKey`: **`personal-information`**). Response shape per [employee-template-api-contracts.md](../form-builder-document/employee-template-api-contracts.md); seed sets **`compiled`: `null`**.
- **Employee** — [data/mockEmployeeV24Minh.json](data/mockEmployeeV24Minh.json) → MongoDB `employees` (one document per `tenant_id` + `employee_id`). Full record is returned only from **`GET /api/employees/:employeeId`**.

## Notes

- Publish uses sequential updates (no multi-document transaction) so it runs on a **standalone** MongoDB instance from Docker.
- CORS: **open for all origins** (`Access-Control-Allow-Origin` mirrors the request `Origin`). For production, replace with an explicit allowlist.

## Seed runs but Atlas “does not change”

- **`MONGODB_URI` in `.env` must be the same cluster** you open in Atlas Data Explorer. If URI points to `localhost`, seed updates your **local** Mongo only — Atlas will look unchanged.
- After seed, expect **one** row in `form_templates` and **one** in `employees` (for the default tenant + `EMP-1042`). Check **`updatedAt`** / **`_id`** after re-seeding.
- Run `npm run seed` and read the printed **`Target:`** (redacted URI) and **`Connected DB name:`** to confirm where writes go.

## MongoDB Atlas troubleshooting

If `npm run seed` fails with **`tlsv1 alert internal error`** or **`ReplicaSetNoPrimary`**:

1. **Use the full URI from Atlas** (Connect → Drivers). Include `retryWrites=true` and `w=majority`, for example:
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/blazeup_form_demo?retryWrites=true&w=majority&appName=Cluster0`
2. **URL-encode** the database user password (and username if it has special characters). Common encodings: `@` → `%40`, `:` → `%3A`, `/` → `%2F`.
3. **No placeholders** in `.env`: replace `USER` / `PASS` with real values; do not wrap values in angle brackets.
4. **Network Access** in Atlas must allow your current IP (or `0.0.0.0/0` only for demos).
5. On **Windows**, the app defaults to **IPv4** (`family: 4`) for the driver, which often fixes Atlas TLS issues. Set `MONGODB_FORCE_IPV4=0` in `.env` if you need default DNS behavior.
6. Try the same URI in **MongoDB Compass**: if Compass connects but Node does not, update Node to **20 LTS** and retry; if neither connects, the URI or network access is wrong.
