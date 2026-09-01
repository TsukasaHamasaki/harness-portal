import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deleteSnapshot, listSnapshots, loadSnapshot } from "./snapshot-store.mjs";
import { cliText } from "../shared/i18n.mjs";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function safeStaticPath(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const root = path.resolve(distDir);
  const candidate = path.resolve(root, "." + decoded);
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}

function send(res, statusCode, body, type = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": type });
  res.end(body);
}

function sendJson(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value), "application/json; charset=utf-8");
}

function snapshotIdFromPath(pathname) {
  const prefix = "/api/snapshots/";
  if (!pathname.startsWith(prefix)) return null;
  const encodedId = pathname.slice(prefix.length);
  if (!encodedId || encodedId.includes("/")) return null;
  try {
    const id = decodeURIComponent(encodedId);
    return id && !id.includes("/") && !id.includes("\\") ? id : null;
  } catch {
    return null;
  }
}

function isSnapshotItemPath(pathname) {
  return pathname.startsWith("/api/snapshots/");
}

/** Resolve once we know whether 127.0.0.1:<port> can be bound right now. */
export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = http.createServer();
    const settle = (available) => {
      probe.removeAllListeners();
      if (available) probe.close(() => resolve(true));
      else resolve(false);
    };
    probe.once("error", () => settle(false));
    probe.once("listening", () => settle(true));
    // Port 0 always succeeds and would make the check meaningless.
    if (port === 0) resolve(true);
    else probe.listen(port, "127.0.0.1");
  });
}

/**
 * Pick the port to bind before doing the two minutes of collection work.
 * An explicit --port is honoured as-is: if it is taken, fail now rather than later.
 * The default port falls forward to the next free one, like any dev server.
 */
export async function resolveServePort(port, { explicit = false, maxAttempts = 20, lang = "ja" } = {}) {
  if (await isPortAvailable(port)) return port;
  if (explicit) {
    const error = new Error(cliText(lang, "portInUse", port));
    error.code = "EADDRINUSE";
    throw error;
  }
  for (let candidate = port + 1; candidate < port + maxAttempts && candidate <= 65535; candidate += 1) {
    if (await isPortAvailable(candidate)) return candidate;
  }
  const error = new Error(cliText(lang, "portRangeInUse", port, port + maxAttempts - 1));
  error.code = "EADDRINUSE";
  throw error;
}

/** Start a loopback-only static server and return a synchronous close handle. */
export function serve({
  snapshot,
  port = 4477,
  distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist-app"),
  dataDir,
}) {
  const resolvedDistDir = path.resolve(distDir);
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    if (requestUrl.pathname === "/api/snapshots" && req.method === "GET") {
      sendJson(res, 200, listSnapshots(dataDir));
      return;
    }

    const snapshotItemPath = isSnapshotItemPath(requestUrl.pathname);
    const snapshotId = snapshotIdFromPath(requestUrl.pathname);
    if (snapshotItemPath && snapshotId === null) {
      sendJson(res, 404, { error: "Snapshot not found" });
      return;
    }

    if (snapshotId !== null && req.method === "GET") {
      const storedSnapshot = loadSnapshot(snapshotId, dataDir);
      if (!storedSnapshot) {
        sendJson(res, 404, { error: "Snapshot not found" });
        return;
      }
      sendJson(res, 200, storedSnapshot);
      return;
    }

    if (snapshotId !== null && req.method === "DELETE") {
      if (!deleteSnapshot(snapshotId, dataDir)) {
        sendJson(res, 404, { error: "Snapshot not found" });
        return;
      }
      send(res, 204, "");
      return;
    }

    if (req.method !== "GET") {
      send(res, 405, "Method Not Allowed\n", "text/plain; charset=utf-8");
      return;
    }

    if (requestUrl.pathname === "/api/snapshot") {
      sendJson(res, 200, snapshot);
      return;
    }

    const requested = safeStaticPath(resolvedDistDir, requestUrl.pathname);
    let filePath = requested;
    try {
      if (!filePath || !fs.statSync(filePath).isFile()) filePath = path.join(resolvedDistDir, "index.html");
    } catch {
      filePath = path.join(resolvedDistDir, "index.html");
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        send(res, 404, "Not Found\n", "text/plain; charset=utf-8");
        return;
      }
      send(res, 200, body, contentType(filePath));
    });
  });

  server.listen(port, "127.0.0.1");
  let closePromise;
  const result = {
    get url() {
      const address = server.address();
      const actualPort = address && typeof address === "object" ? address.port : port;
      return "http://localhost:" + actualPort;
    },
    close() {
      if (closePromise) return closePromise;
      closePromise = new Promise((resolve) => {
        server.close(() => resolve());
      });
      return closePromise;
    },
    server,
  };
  return result;
}
