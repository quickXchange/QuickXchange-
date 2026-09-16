import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ready" });
  } catch (error) {
    req.log.error({ err: error }, "Database readiness check failed");
    res.status(503).json({ status: "unavailable" });
  }
});

export default router;
