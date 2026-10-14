import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { createServer, type ClientRequest, type IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import { createQuickexTransport, type TransportFailure } from "../src/lib/quickex-transport";

class FakeTLS extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
    queueMicrotask(() => this.emit("close"));
    return this;
  }
}
function fakeRequest(body = '{"ok":true}', stall = false) {
  return (_options: unknown, receive: (response: IncomingMessage) => void) => {
    const req = new EventEmitter() as ClientRequest;
    const res = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
    req.write = () => true;
    req.destroy = ((error?: Error) => {
      res.destroy();
      queueMicrotask(() => { if (error) req.emit("error", error); req.emit("close"); });
      return req;
    });
    req.end = (() => {
      queueMicrotask(() => {
        receive(res as unknown as IncomingMessage);
        if (!stall) {
          res.end(body);
          res.once("end", () => req.emit("close"));
        }
      });
      return req;
    }) as ClientRequest["end"];
    return req;
  };
}
function immediateTLS() {
  const socket = new FakeTLS();
  queueMicrotask(() => socket.emit("secureConnect"));
  return socket as unknown as TLSSocket;
}

test("official HTTPS keeps SNI, Host and certificate validation; losing probes are destroyed", async () => {
  const sockets: FakeTLS[] = [];
  const transport = createQuickexTransport({
    addresses: async () => ["192.0.2.1", "192.0.2.2"],
    tls: ip => {
      const socket = new FakeTLS();
      sockets.push(socket);
      if (ip.endsWith(".1")) queueMicrotask(() => socket.emit("secureConnect"));
      return socket as unknown as TLSSocket;
    },
    request: (options, callback) => {
      assert.equal(options.hostname, "192.0.2.1");
      assert.equal(options.servername, "quickex.io");
      assert.equal(options.rejectUnauthorized, true);
      assert.equal((options.headers as Record<string, string>).host, "quickex.io");
      assert.equal(options.path, "/api/v2/example?test=1");
      return fakeRequest()(options, callback);
    },
  });
  const response = await transport.fetch("https://quickex.io/api/v2/example?test=1", {}, 500);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(sockets.length, 2);
  assert.ok(sockets.every(socket => socket.destroyed));
});

test("concurrent calls share reachability work, not response/quote data", async () => {
  let lookups = 0;
  let reads = 0;
  const transport = createQuickexTransport({
    addresses: async () => { lookups++; return ["192.0.2.1"]; },
    tls: immediateTLS,
    request: (options, callback) => { reads++; return fakeRequest()(options, callback); },
  });
  await Promise.all(Array.from({ length: 8 }, () => transport.fetch("https://quickex.io/test", {}, 500)));
  assert.equal(lookups, 1);
  assert.equal(reads, 8);
});

test("DNS is included in the caller deadline and a late result cannot start its HTTP request", async () => {
  let reads = 0;
  const transport = createQuickexTransport({
    addresses: () => new Promise(resolve => setTimeout(() => resolve(["192.0.2.1"]), 80)),
    tls: immediateTLS,
    request: (options, callback) => { reads++; return fakeRequest()(options, callback); },
  });
  await assert.rejects(transport.fetch("https://quickex.io/test", {}, 15), { name: "TimeoutError" });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(reads, 0);
});

test("one caller timeout does not cancel another caller's shared reachability work", async () => {
  const transport = createQuickexTransport({
    addresses: () => new Promise(resolve => setTimeout(() => resolve(["192.0.2.1"]), 50)),
    tls: immediateTLS, request: fakeRequest(),
  });
  const short = transport.fetch("https://quickex.io/test", {}, 10);
  const long = transport.fetch("https://quickex.io/test", {}, 500);
  await assert.rejects(short, { name: "TimeoutError" });
  assert.deepEqual(await (await long).json(), { ok: true });
});

test("official response bodies have a total deadline, including a stalled body", async () => {
  const failures: TransportFailure[] = [];
  const transport = createQuickexTransport({
    addresses: async () => ["192.0.2.1"], tls: immediateTLS,
    request: fakeRequest("", true), onFailure: failure => failures.push(failure),
  });
  await assert.rejects(transport.fetch("https://quickex.io/test", {}, 30), { name: "TimeoutError" });
  assert.equal(failures[0]?.stage, "response");
  assert.equal(failures[0]?.code, "ETIMEDOUT");
});

test("reachability failures coalesce briefly, then recover; no HTTP call or stale value is invented", async () => {
  let lookups = 0;
  let recovered = false;
  const transport = createQuickexTransport({
    addresses: async () => { lookups++; return ["192.0.2.1"]; },
    tls: () => {
      if (recovered) return immediateTLS();
      const socket = new FakeTLS();
      queueMicrotask(() => socket.emit("error", new Error("unreachable")));
      return socket as unknown as TLSSocket;
    },
    request: fakeRequest(),
  });
  await assert.rejects(transport.fetch("https://quickex.io/test", {}, 500));
  await assert.rejects(transport.fetch("https://quickex.io/test", {}, 500));
  assert.equal(lookups, 1);
  recovered = true;
  await new Promise(resolve => setTimeout(resolve, 2_020));
  assert.deepEqual(await (await transport.fetch("https://quickex.io/test", {}, 500)).json(), { ok: true });
  assert.equal(lookups, 2);
});

test("configured alternate origin also bounds the entire streamed body", async () => {
  const server = createServer((_req, res) => { res.writeHead(200); res.write('{"pending":'); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address() as { port: number };
    await assert.rejects(createQuickexTransport().fetch(`http://127.0.0.1:${address.port}/`, {}, 80));
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
