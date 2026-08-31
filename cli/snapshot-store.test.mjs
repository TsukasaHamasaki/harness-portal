import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MAX_SNAPSHOTS,
  deleteSnapshot,
  listSnapshots,
  loadSnapshot,
  saveSnapshot,
  snapshotFileName,
  snapshotsDir,
} from "./snapshot-store.mjs";

function snapshot(exportedAt, skills = 1) {
  return {
    schemaVersion: 2,
    exportedAt,
    counts: { skills },
    warnings: [],
  };
}

test("snapshot store creates private files, lists newest first, loads, and deletes", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-store-"));
  try {
    const older = snapshot("2026-08-15T01:23:45.000Z", 1);
    const newer = snapshot("2026-08-15T02:23:45.000Z", 2);
    saveSnapshot(older, dataDir);
    const saved = saveSnapshot(newer, dataDir);

    const directory = snapshotsDir(dataDir);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    const files = fs.readdirSync(directory);
    assert.deepEqual(files.sort(), [
      snapshotFileName(older.exportedAt),
      snapshotFileName(newer.exportedAt),
    ].sort());
    for (const file of files) assert.equal(fs.statSync(path.join(directory, file)).mode & 0o777, 0o600);

    assert.deepEqual(listSnapshots(dataDir).map((entry) => entry.exportedAt), [newer.exportedAt, older.exportedAt]);
    assert.deepEqual(loadSnapshot(saved.id, dataDir), newer);
    assert.equal(deleteSnapshot(saved.id, dataDir), true);
    assert.equal(fs.existsSync(path.join(directory, saved.id)), false);
    assert.equal(deleteSnapshot(saved.id, dataDir), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("snapshot store retains only the newest 30 exportedAt values", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-store-retention-"));
  try {
    for (let index = 0; index < 35; index += 1) {
      const exportedAt = new Date(Date.UTC(2026, 7, 15, 0, index, 0)).toISOString();
      saveSnapshot(snapshot(exportedAt, index), dataDir);
    }

    const entries = listSnapshots(dataDir);
    assert.equal(entries.length, MAX_SNAPSHOTS);
    assert.deepEqual(entries.map((entry) => entry.exportedAt), Array.from({ length: 30 }, (_, offset) => {
      const index = 34 - offset;
      return new Date(Date.UTC(2026, 7, 15, 0, index, 0)).toISOString();
    }));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
