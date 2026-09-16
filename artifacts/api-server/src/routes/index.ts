import { Router, type IRouter } from "express";
import healthRouter from "./health";
import exchangeRouter from "./exchange";
import quickexRouter from "./quickex";
import operatorsRouter from "./operators";
import affiliateRouter from "./affiliate";
import newsletterRouter from "./newsletter";
import landingBackgroundRouter from "./landing-background";
import customerManagementRouter from "./customer-management";
import siteContentRouter from "./site-content";
import { requireOperator } from "../lib/operator-auth";
import { requireOwner } from "../lib/operator-auth";
import blogRouter from "./blog";
import { adminPolicy } from "../lib/admin-policy";
import teamMembersRouter from "./team-members";
import whitebitRouter, { whitebitOperatorRouter, whitebitWebhookRouter } from "./whitebit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(whitebitRouter);
router.use(whitebitWebhookRouter);
// All top-level Admin APIs are operator-only by default. Individual owner
// routes retain their existing requireOwner middleware.
router.use("/admin", requireOperator);
router.use("/admin/whitebit", requireOwner);
router.use(whitebitOperatorRouter);
// Authenticate first, then enforce the centralized granular policy before any
// Admin router can execute. Unmatched staff routes are deny-by-default.
router.use(adminPolicy);
router.use(landingBackgroundRouter);
router.use(exchangeRouter);
router.use(customerManagementRouter);
router.use(siteContentRouter);
router.use("/quickex", quickexRouter);
router.use(blogRouter);
router.use(teamMembersRouter);
router.use(operatorsRouter);
router.use(affiliateRouter);
router.use(newsletterRouter);

export default router;
