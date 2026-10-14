import { lookup } from "node:dns/promises";
import { request, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { connect, type TLSSocket } from "node:tls";
import { performance } from "node:perf_hooks";

type Stage = "dns" | "tcp_tls" | "http" | "response";
export type TransportFailure = {
  stage: Stage;
  code: string;
  elapsedMs: number;
};
type Ports = {
  addresses?: () => Promise<string[]>;
  tls?: (address: string) => TLSSocket;
  request?: (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
  onFailure?: (failure: TransportFailure) => void;
};

function timeoutError(): Error {
  return Object.assign(new Error("Quickex transport deadline exceeded."), {
    name: "TimeoutError", code: "ETIMEDOUT",
  });
}

function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    // Attach handlers even when already aborted so a late DNS failure is consumed.
    promise.then(value => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, error => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** Official-host transport. Credentials/signing and financial retry rules stay in quickex.ts. */
export function createQuickexTransport(ports: Ports = {}) {
  let cached: { address: string; expiresAt: number } | undefined;
  let failure: { error: unknown; expiresAt: number; stage: Stage } | undefined;
  let refreshing: Promise<string> | undefined;
  let refreshStage: Stage = "dns";
  const tls = ports.tls ?? ((address: string) => connect({
    host: address, port: 443, servername: "quickex.io", rejectUnauthorized: true,
  }));

  function probe(address: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = tls(address);
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        socket.removeListener("secureConnect", secure);
        // Keep the error listener until close: destroy can complete asynchronously.
        socket.once("close", () => socket.removeListener("error", onError));
        socket.destroy();
        if (error) reject(error);
        else resolve(address);
      };
      const abort = () => finish(signal.reason);
      const secure = () => finish();
      const onError = (error: Error) => finish(error);
      socket.once("secureConnect", secure);
      socket.on("error", onError);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }

  function address(): Promise<string> {
    if (cached && cached.expiresAt > performance.now()) return Promise.resolve(cached.address);
    if (failure && failure.expiresAt > performance.now()) return Promise.reject(failure.error);
    if (refreshing) return refreshing;
    failure = undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(timeoutError()), 5_000);
    const refresh = (async () => {
      try {
        refreshStage = "dns";
        const addresses = await untilAbort(
          ports.addresses?.() ?? lookup("quickex.io", { all: true, family: 4 })
            .then(rows => rows.map(row => row.address)),
          controller.signal,
        );
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!addresses.length) throw new Error("Quickex DNS returned no IPv4 addresses.");
        refreshStage = "tcp_tls";
        const selected = await Promise.any([...new Set(addresses)].map(ip => probe(ip, controller.signal)));
        cached = { address: selected, expiresAt: performance.now() + 300_000 };
        failure = undefined;
        return selected;
      } catch (error) {
        // Cache only the reachability failure, never a quote/status or empty catalog.
        failure = { error, expiresAt: performance.now() + 2_000, stage: refreshStage };
        throw error;
      } finally {
        clearTimeout(timer);
        controller.abort(new Error("Quickex address selection completed."));
      }
    })();
    refreshing = refresh;
    // This handler also consumes rejection if all callers have reached their deadlines.
    void refresh.then(() => {
      if (refreshing === refresh) refreshing = undefined;
    }, () => {
      if (refreshing === refresh) refreshing = undefined;
    });
    return refresh;
  }

  return {
    async fetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
      const parsed = new URL(url);
      const start = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError()), Math.max(1, timeoutMs));
      let stage: Stage = "dns";
      try {
        if (parsed.protocol !== "https:" || parsed.hostname !== "quickex.io") {
          stage = "http";
          const response = await fetch(url, { ...init, signal: controller.signal });
          stage = "response";
          const bytes = await response.arrayBuffer();
          return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
        }
        const selected = await untilAbort(address(), controller.signal);
        stage = "http";
        return await new Promise<Response>((resolve, reject) => {
          const headers: Record<string, string> = {};
          new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
          headers.host = parsed.host;
          const req = (ports.request ?? request)({
            protocol: "https:", hostname: selected,
            port: parsed.port ? Number(parsed.port) : 443,
            path: `${parsed.pathname}${parsed.search}`, method: init.method,
            headers, servername: parsed.hostname, rejectUnauthorized: true,
          }, res => {
            stage = "response";
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.once("aborted", () => reject(new Error("Quickex response was interrupted.")));
            res.once("error", reject);
            res.once("end", () => {
              const responseHeaders = new Headers();
              for (const [name, value] of Object.entries(res.headers)) {
                if (Array.isArray(value)) value.forEach(item => responseHeaders.append(name, item));
                else if (value !== undefined) responseHeaders.set(name, String(value));
              }
              try {
                resolve(new Response([204, 205, 304].includes(res.statusCode ?? 502)
                  ? null : Buffer.concat(chunks), {
                  status: res.statusCode ?? 502, statusText: res.statusMessage,
                  headers: responseHeaders,
                }));
              } catch (error) { reject(error); }
            });
          });
          const abort = () => req.destroy(controller.signal.reason);
          req.once("close", () => controller.signal.removeEventListener("abort", abort));
          req.once("error", error => {
            if (cached?.address === selected) cached = undefined;
            reject(error);
          });
          if (controller.signal.aborted) abort();
          else controller.signal.addEventListener("abort", abort, { once: true });
          if (typeof init.body === "string" || init.body instanceof Uint8Array) req.write(init.body);
          else if (init.body !== undefined && init.body !== null) {
            req.destroy(new TypeError("Unsupported Quickex request body."));
            return;
          }
          req.end();
        });
      } catch (error) {
        const errorCode = (value: unknown): string =>
          value && typeof value === "object" && "code" in value
            ? String(value.code) : value instanceof Error ? value.name : "UNKNOWN";
        const code = error instanceof AggregateError
          ? [...new Set(error.errors.map(errorCode))].join("|") : errorCode(error);
        ports.onFailure?.({ stage: stage === "dns" ? failure?.stage ?? refreshStage : stage,
          code, elapsedMs: Math.round(performance.now() - start) });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
