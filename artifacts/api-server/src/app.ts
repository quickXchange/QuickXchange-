import express, {
  type ErrorRequestHandler,
  type Express,
} from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { trustedProxyHops } from "./lib/client-ip";
import { QuickexApiError } from "./lib/quickex";
import { ApiError } from "./lib/api-error";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", trustedProxyHops());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);


app.use("/api", router);

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    req.log.warn("API request JSON could not be parsed");
    res.status(400).json({
      error: "The request body contains invalid JSON.",
      code: "VALIDATION_ERROR",
      retryable: false,
      outcomeUnknown: false,
    });
    return;
  }

  if (error instanceof Error && error.name === "ZodError") {
    const issues = "issues" in error ? (error as Error & { issues?: unknown }).issues : undefined;
    req.log.warn({ issues }, "API request validation failed");
    res.status(400).json({
      error: "The request contains invalid or missing fields.",
      code: "VALIDATION_ERROR",
      retryable: false,
      outcomeUnknown: false,
    });
    return;
  }

  if (error instanceof QuickexApiError || error instanceof ApiError) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;
    const orderId = error instanceof ApiError ? error.orderId : undefined;
    req.log.warn(
      {
        code: error.code,
        ...(error instanceof QuickexApiError
          ? { provider: "Quickex", providerStatus: error.providerStatus }
          : {}),
        ...(orderId ? { orderId } : {}),
      },
      "API request rejected",
    );
    res.status(status).json({
      error: error.message,
      code: error.code,
      retryable: error.retryable,
      outcomeUnknown: error.outcomeUnknown,
      ...(orderId ? { orderId } : {}),
    });
    return;
  }

  req.log.error({ err: error }, "Unhandled API error");
  res.status(500).json({
    error: "The request could not be completed.",
    code: "INTERNAL_ERROR",
    retryable: false,
    outcomeUnknown: false,
  });
};

app.use(errorHandler);

export default app;
