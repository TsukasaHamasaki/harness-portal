import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_DATA_DIR = path.join(os.homedir(), ".harness");
export const SNAPSHOTS_DIR_NAME = "snapshots";
export const MAX_SNAPSHOTS = 30;

function resolvedDataDir(dataDir = DEFAULT_DATA_DIR) {
  return path.resolve(dataDir);
}

export function snapshotsDir(dataDir = DEFAULT_DATA_DIR) {
  return path.join(resolvedDataDir(dataDir), SNAPSHOTS_DIR_NAME);
}

function ensureSnapshotsDir(dataDir) {
  const directory = snapshotsDir(dataDir);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return directory;
}

function safeFileNamePart(value) {
  return String(value)
    .replaceAll(":", "-")
    .replace(/[\\/]/g, "-");
}

export function snapshotFileName(exportedAt) {
  return `harness-${safeFileNamePart(exportedAt)}.json`;
}

function isSnapshotId(id) {
  return typeof id === "string"
    && id.length > 0
    && id !== "."
    && id !== ".."
    && !id.includes("/")
    && !id.includes("\\")
    && /^harness-.+\.json$/.test(id);
}

function snapshotPath(directory, id) {
  if (!isSnapshotId(id)) return null;
  return path.join(directory, id);
}

function parseSnapshotFile(directory, id) {
  const filePath = snapshotPath(directory, id);
  if (!filePath) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return { id, filePath, snapshot: value };
  } catch {
    return null;
  }
}

function listRecords(dataDir) {
  const directory = snapshotsDir(dataDir);
  let fileNames;
  try {
    fileNames = fs.readdirSync(directory)
      .filter((fileName) => isSnapshotId(fileName));
  } catch {
    return [];
  }

  return fileNames
    .map((id) => parseSnapshotFile(directory, id))
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Date.parse(typeof left.snapshot.exportedAt === "string" ? left.snapshot.exportedAt : "");
      const rightTime = Date.parse(typeof right.snapshot.exportedAt === "string" ? right.snapshot.exportedAt : "");
      const normalizedLeft = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
      const normalizedRight = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
      return normalizedRight - normalizedLeft || right.id.localeCompare(left.id);
    });
}

function countsOf(snapshot) {
  return snapshot?.counts && typeof snapshot.counts === "object" && !Array.isArray(snapshot.counts)
    ? { ...snapshot.counts }
    : {};
}

function metadataOf(record) {
  return {
    id: record.id,
    exportedAt: typeof record.snapshot.exportedAt === "string" ? record.snapshot.exportedAt : "",
    counts: countsOf(record.snapshot),
  };
}

function uniquePath(directory, preferredName) {
  const preferredPath = path.join(directory, preferredName);
  if (!fs.existsSync(preferredPath)) return preferredPath;

  const extension = ".json";
  const stem = preferredName.slice(0, -extension.length);
  for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = path.join(directory, `${stem}-${suffix}${extension}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not allocate a snapshot filename");
}

export function saveSnapshot(snapshot, dataDir = DEFAULT_DATA_DIR) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("snapshot must be an object");
  }

  const directory = ensureSnapshotsDir(dataDir);
  const exportedAt = typeof snapshot.exportedAt === "string" && snapshot.exportedAt
    ? snapshot.exportedAt
    : new Date().toISOString();
  const filePath = uniquePath(directory, snapshotFileName(exportedAt));
  let created = false;
  try {
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    created = true;
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if (created) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Preserve the original write or permission error.
      }
    }
    throw error;
  }

  const id = path.basename(filePath);
  const records = listRecords(dataDir);
  for (const record of records.slice(MAX_SNAPSHOTS)) {
    fs.unlinkSync(record.filePath);
  }

  return metadataOf({ id, snapshot });
}

export function listSnapshots(dataDir = DEFAULT_DATA_DIR) {
  return listRecords(dataDir).slice(0, MAX_SNAPSHOTS).map(metadataOf);
}

export function loadSnapshot(id, dataDir = DEFAULT_DATA_DIR) {
  const record = parseSnapshotFile(snapshotsDir(dataDir), id);
  return record?.snapshot ?? null;
}

export function deleteSnapshot(id, dataDir = DEFAULT_DATA_DIR) {
  const filePath = snapshotPath(snapshotsDir(dataDir), id);
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
