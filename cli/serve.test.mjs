import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isPortAvailable, resolveServePort, serve } from "./serve.mjs";
import { listSnapshots, saveSnapshot, snapshotsDir } from "./snapshot-store.mjs";

async function waitForListening(server) {
  if (server.server.listening) return;
  await new Promise((resolve, reject) => {
    server.server.once("listening", resolve);
    server.server.once("error", reject);
  });
}

test("serve provides snapshot API, static files, and SPA fallback on loopback", async () => {
  const distDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-serve-"));
  await fs.promises.writeFile(path.join(distDir, "index.html"), "<!doctype html><div id=\"root\">SPA</div>");
  await fs.promises.writeFile(path.join(distDir, "asset.js"), "console.log('asset');");
  const snapshot = { schemaVersion: 2, counts: { skills: 1 } };
  const running = serve({ snapshot, port: 0, distDir });
  try {
    await waitForListening(running);
    const address = running.server.address();
    assert.equal(address.address, "127.0.0.1");
    assert.notEqual(address.address, "0.0.0.0");
    assert.equal(running.url, `http://localhost:${address.port}`);

    const api = await fetch(running.url + "/api/snapshot");
    assert.equal(api.status, 200);
    assert.deepEqual(await api.json(), snapshot);

    const root = await fetch(running.url + "/");
    assert.equal(root.status, 200);
    assert.match(await root.text(), /SPA/);

    const asset = await fetch(running.url + "/asset.js");
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /asset/);

    const unknown = await fetch(running.url + "/capabilities/does-not-exist");
    assert.equal(unknown.status, 200);
    assert.match(await unknown.text(), /SPA/);

  } finally {
    await running.close();
  }
});

test("serve exposes local snapshot history and deletes the backing file", async () => {
  const distDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-serve-history-dist-"));
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "harness-serve-history-data-"));
  await fs.promises.writeFile(path.join(distDir, "index.html"), "SPA");
  const older = { schemaVersion: 2, exportedAt: "2026-08-15T01:00:00.000Z", counts: { skills: 1 } };
  const newer = { schemaVersion: 2, exportedAt: "2026-08-15T02:00:00.000Z", counts: { skills: 2 } };
  saveSnapshot(older, dataDir);
  const savedNewer = saveSnapshot(newer, dataDir);
  const running = serve({ snapshot: newer, port: 0, distDir, dataDir });
  try {
    await waitForListening(running);

    const listResponse = await fetch(running.url + "/api/snapshots");
    assert.equal(listResponse.status, 200);
    assert.deepEqual((await listResponse.json()).map((entry) => entry.exportedAt), [newer.exportedAt, older.exportedAt]);

    const loadedResponse = await fetch(running.url + "/api/snapshots/" + encodeURIComponent(savedNewer.id));
    assert.equal(loadedResponse.status, 200);
    assert.deepEqual(await loadedResponse.json(), newer);

    const missingResponse = await fetch(running.url + "/api/snapshots/not-a-real-snapshot.json");
    assert.equal(missingResponse.status, 404);

    const deleteResponse = await fetch(running.url + "/api/snapshots/" + encodeURIComponent(savedNewer.id), { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);
    assert.equal(fs.existsSync(path.join(snapshotsDir(dataDir), savedNewer.id)), false);
  } finally {
    await running.close();
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("resolveServePort は空きポートをそのまま返す", async () => {
  const free = await resolveServePort(0);
  assert.equal(free, 0);
  const probe = serve({ snapshot: {}, port: 0, distDir: os.tmpdir() });
  await waitForListening(probe);
  const taken = probe.server.address().port;
  assert.equal(await isPortAvailable(taken), false);
  await probe.close();
  assert.equal(await resolveServePort(taken), taken);
});

test("resolveServePort は既定ポートが埋まっていれば次の空きへ送る", async () => {
  const occupied = serve({ snapshot: {}, port: 0, distDir: os.tmpdir() });
  await waitForListening(occupied);
  const taken = occupied.server.address().port;

  const resolved = await resolveServePort(taken, { explicit: false });
  assert.notEqual(resolved, taken);
  assert.ok(resolved > taken);

  await occupied.close();
});

test("resolveServePort は --port 明示時に即座に EADDRINUSE で失敗する", async () => {
  const occupied = serve({ snapshot: {}, port: 0, distDir: os.tmpdir() });
  await waitForListening(occupied);
  const taken = occupied.server.address().port;

  await assert.rejects(
    () => resolveServePort(taken, { explicit: true }),
    (error) => {
      assert.equal(error.code, "EADDRINUSE");
      assert.match(error.message, /既に使われています/);
      return true;
    },
  );

  await occupied.close();
});
