import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { tenantMiddleware } from "./middleware/tenantMiddleware.js";
import formTemplatesRouter from "./routes/formTemplates.js";
import employeesRouter from "./routes/employees.js";
import { FormTemplate } from "./models/FormTemplate.js";
import { EmployeeRecord } from "./models/EmployeeRecord.js";
import { mongoConnectOptions } from "./lib/mongoConnectOptions.js";

const PORT = Number(process.env.PORT) || 9999;
const MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/blazeup_form_demo";

async function main() {
  await mongoose.connect(MONGODB_URI, mongoConnectOptions());
  await FormTemplate.syncIndexes();
  await EmployeeRecord.syncIndexes();

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));

  app.use(
    "/api/form-templates/employee-management",
    tenantMiddleware,
    formTemplatesRouter,
  );

  app.use("/api/employees", tenantMiddleware, employeesRouter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(PORT);

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop the other process or set PORT in .env (e.g. PORT=3001).`,
      );
      console.error(`Windows: netstat -ano | findstr :${PORT}`);
      console.error("Then: taskkill /PID <pid> /F");
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  server.once("listening", () => {
    console.log(`employee-backend-demo listening on http://localhost:${PORT}`);
  });
}

main().catch((err: unknown) => {
  const e = err as { name?: string };
  if (e?.name === "MongooseServerSelectionError") {
    console.error(
      "\n[MongoDB] Cannot reach the cluster (often IP whitelist or network change). Check:",
    );
    console.error(
      "  • Atlas → Network Access → add your current IP, or 0.0.0.0/0 for demo only.",
    );
    console.error(
      "  • Same Wi‑Fi/VPN as when seed worked? Dynamic ISP IP may have changed.",
    );
    console.error(
      "  • .env MONGODB_URI must match the cluster you used for npm run seed.\n",
    );
  }
  console.error(err);
  process.exit(1);
});
