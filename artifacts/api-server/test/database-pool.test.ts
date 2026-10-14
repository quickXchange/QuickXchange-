import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { once } from "node:events";
import { ObservedPool } from "../../../lib/db/src/observed-pool";
import { classifyDatabasePoolError } from "../../../lib/db/src/pool-telemetry";

test("provider errors are not mislabeled as SQL or pool failures", () => {
  assert.equal(classifyDatabasePoolError({ code: "QUICKEX_NETWORK", message: "Unavailable" }), "external_provider_failure");
  assert.equal(classifyDatabasePoolError({ cause: new Error("Connection terminated due to connection timeout") }), "physical_connection_establishment_timeout");
  assert.equal(classifyDatabasePoolError(new Error("timeout exceeded when trying to connect")), "pool_acquisition_timeout");
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
  } finally {
    await pool.end();
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
