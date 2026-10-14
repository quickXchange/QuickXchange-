import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { once } from "node:events";
import { ObservedPool } from "../../../lib/db/src/observed-pool";
import { classifyDatabasePoolError, isTransientConnectionAcquisitionError } from "../../../lib/db/src/pool-telemetry";

test("provider errors are not mislabeled as SQL or pool failures", () => {
  assert.equal(classifyDatabasePoolError({ code: "QUICKEX_NETWORK", message: "Unavailable" }), "external_provider_failure");
  assert.equal(classifyDatabasePoolError({ cause: new Error("Connection terminated due to connection timeout") }), "physical_connection_establishment_timeout");
  assert.equal(classifyDatabasePoolError(new Error("timeout exceeded when trying to connect")), "pool_acquisition_timeout");
  assert.equal(isTransientConnectionAcquisitionError({ cause: { code: "ECONNRESET" } }), true);
  assert.equal(isTransientConnectionAcquisitionError({ code: "28P01" }), false);
  assert.equal(isTransientConnectionAcquisitionError(new Error("timeout exceeded when trying to connect")), false);
});

test("observed pool preserves callback/Promise acquisition, reuse, release and end", async () => {
  let physicalConnections = 0;
  const server = createServer(socket => {
    physicalConnections++;
    let initialized = false;
    socket.on("data", data => {
      if (!initialized) {
        initialized = true;
        // Minimal test-only PostgreSQL AuthenticationOk + ReadyForQuery.
        socket.write(Buffer.from("5200000008000000005a0000000549", "hex"));
      } else if (data[0] === 88) socket.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const pool = new ObservedPool({
    host: "127.0.0.1", port, user: "synthetic", database: "synthetic",
    max: 1, connectionTimeoutMillis: 500,
  });
  try {
    const first = await pool.connect();
    first.release();
    await new Promise<void>((resolve, reject) => pool.connect((error, client, release) => {
      if (error) return reject(error);
      assert.equal(client, first);
      release();
      resolve();
    }));
    assert.equal(physicalConnections, 1);
    assert.equal(pool.metrics().acquisitions, 2);
    assert.equal(pool.metrics().acquisitionFailures, 0);
    assert.equal(pool.idleCount, 1);
    const held = await pool.connect();
    try {
      await assert.rejects(pool.connect(), error => {
        assert.equal(classifyDatabasePoolError(error), "pool_acquisition_timeout");
        return true;
      });
      assert.equal(pool.totalCount, 1);
      assert.equal(pool.waitingCount, 0);
      assert.equal(pool.metrics().acquisitionFailures, 1);
    } finally {
      held.release();
    }
  } finally {
    await new Promise<void>(resolve => pool.end(resolve));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("physical handshake timeout is measured and failed clients are removed", async () => {
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const pool = new ObservedPool({
    host: "127.0.0.1", port: (server.address() as { port: number }).port,
    user: "synthetic", database: "synthetic", connectionTimeoutMillis: 50,
  });
  try {
    await assert.rejects(pool.connect(), /connection timeout/);
    assert.equal(pool.metrics().acquisitionFailures, 1);
    assert.equal(pool.totalCount, 0);
    assert.equal(pool.waitingCount, 0);
    assert.equal(pool.metrics().connectionRetries, 1);
    assert.equal(pool.metrics().recoveredAcquisitions, 0);
  } finally {
    await pool.end();
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

function pgFrame(type: string, body: Buffer) {
  const size = Buffer.alloc(4);
  size.writeInt32BE(body.length + 4);
  return Buffer.concat([Buffer.from(type), size, body]);
}

for (const fault of ["timeout", "closed"] as const) {
test(`real driver recovers a ${fault} handshake once and submits a write exactly once`, async () => {
  const sockets = new Set<import("node:net").Socket>();
  let connections = 0;
  let writes = 0;
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const connection = ++connections;
    let initialized = false;
    socket.on("data", data => {
      if (connection === 1) {
        if (fault === "closed") socket.end();
        return; // Never complete the first handshake.
      }
      if (!initialized) {
        initialized = true;
        socket.write(Buffer.from("5200000008000000005a0000000549", "hex"));
      } else if (data[0] === 81) {
        writes++;
        socket.write(Buffer.concat([
          pgFrame("C", Buffer.from("INSERT 0 1\0")),
          pgFrame("Z", Buffer.from("I")),
        ]));
      } else if (data[0] === 88) socket.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const pool = new ObservedPool({
    host: "127.0.0.1", port: (server.address() as { port: number }).port,
    user: "synthetic", database: "synthetic", max: 1, connectionTimeoutMillis: 40,
  });
  try {
    // Synthetic local protocol server: no application records or real funds.
    // Exercise both pool.query's callback acquisition and Promise acquisition.
    let result;
    if (fault === "closed") {
      const client = await pool.connect();
      try {
        result = await client.query("INSERT INTO synthetic_ledger VALUES (1)");
      } finally {
        client.release();
      }
    } else {
      result = await pool.query("INSERT INTO synthetic_ledger VALUES (1)");
    }
    assert.equal(result.rowCount, 1);
    assert.equal(connections, 2);
    assert.equal(writes, 1);
    assert.equal(pool.metrics().acquisitions, 1);
    assert.equal(pool.metrics().acquisitionFailures, 0);
    assert.equal(pool.metrics().connectionRetries, 1);
    assert.equal(pool.metrics().recoveredAcquisitions, 1);
    assert.equal(pool.idleCount, 1);
  } finally {
    await pool.end();
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
}

test("a connection lost after a write is submitted is never retried", async () => {
  const sockets = new Set<import("node:net").Socket>();
  let connections = 0;
  let writes = 0;
  const server = createServer(socket => {
    connections++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let initialized = false;
    socket.on("data", data => {
      if (!initialized) {
        initialized = true;
        socket.write(Buffer.from("5200000008000000005a0000000549", "hex"));
      } else if (data[0] === 81) {
        writes++;
        socket.resetAndDestroy();
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const pool = new ObservedPool({
    host: "127.0.0.1", port: (server.address() as { port: number }).port,
    user: "synthetic", database: "synthetic", connectionTimeoutMillis: 100,
  });
  try {
    await assert.rejects(pool.query("INSERT INTO synthetic_ledger VALUES (1)"));
    assert.equal(connections, 1);
    assert.equal(writes, 1);
    assert.equal(pool.metrics().connectionRetries, 0);
    assert.equal(pool.totalCount, 0);
  } finally {
    await pool.end();
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("authentication failure is not retried", async () => {
  let connections = 0;
  const server = createServer(socket => {
    connections++;
    socket.once("data", () => socket.end(pgFrame("E",
      Buffer.from("SFATAL\0C28P01\0Msynthetic authentication failure\0\0"))));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const pool = new ObservedPool({
    host: "127.0.0.1", port: (server.address() as { port: number }).port,
    user: "synthetic", database: "synthetic", connectionTimeoutMillis: 100,
  });
  try {
    await assert.rejects(pool.connect(), { code: "28P01" });
    assert.equal(connections, 1);
    assert.equal(pool.metrics().connectionRetries, 0);
  } finally {
    await pool.end();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
