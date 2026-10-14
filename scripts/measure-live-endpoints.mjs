import { performance } from "node:perf_hooks";

// Read-only public endpoints only. Never log bodies, cookies, tokens, or headers.
const base = new URL(process.argv[2]);
if (base.username || base.password || base.search || base.hash) {
  throw new Error("Use an origin/base URL without credentials or query parameters.");
}
const samples = Number(process.argv[3] ?? 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 5) throw new Error("Use 1–5 samples.");
const paths = [
  "", "admin", "telegram-mini-app/", "api/healthz", "api/readyz",
  "api/exchange/config", "api/quickex/config",
  "api/quickex/admin/diagnostics", "api/telegram/mini-app/orders",
];
const results = [];
for (const path of paths) {
  const timings = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    try {
      const response = await fetch(new URL(path, base.href.endsWith("/") ? base : `${base.href}/`), {
        signal: AbortSignal.timeout(20_000), redirect: "follow",
      });
      await response.arrayBuffer();
      timings.push({ status: response.status, ms: Math.round(performance.now() - start) });
    } catch (error) {
      timings.push({ status: "network_failure", ms: Math.round(performance.now() - start),
        error: error instanceof Error ? error.name : "UNKNOWN" });
    }
  }
  const ordered = timings.map(row => row.ms).sort((a, b) => a - b);
  results.push({ path: `/${path}`, samples: timings, medianMs: ordered[Math.floor(ordered.length / 2)] });
}
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(), origin: base.origin,
  note: "HTTP response including body, not browser rendering or authenticated user journeys. Admin/Mini protected endpoints measure auth gates only; Telegram message delivery is not measured.",
  results,
}, null, 2));
