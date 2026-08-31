// Values emitted by the collector must not contain credentials, identifiers, or
// machine-specific home paths.  Keep this module dependency-free because it is
// also used by the CLI's no-agent path.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TOKEN_RE =
  /\bsk-[A-Za-z0-9_-]{6,}\b|\bghp_[A-Za-z0-9_-]{6,}\b|\bghs_[A-Za-z0-9_-]{6,}\b|\bxox[A-Za-z0-9_-]{6,}\b|\bAIza[A-Za-z0-9_-]{10,}\b|\bBearer\s+[A-Za-z0-9._-]+\b/g;
const HEX40_RE = /\b[0-9a-fA-F]{40}\b/g;
const BASE64_64_RE = /\b[A-Za-z0-9+/]{64,}={0,2}\b/g;
const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\b/g;
const DIGITS9_RE = /\b\d{9}\b/g;

// Match a complete user component, while retaining the path separator after
// the home directory. Both POSIX and Windows spellings are intentionally
// supported because snapshots can be imported on another operating system.
const POSIX_HOME_RE = /(^|[^A-Za-z0-9_])\/(?:Users|home)\/[^\\/\s]+/g;
const WINDOWS_HOME_RE = /(^|[^A-Za-z0-9_])[A-Za-z]:[\\/]Users[\\/][^\\/\s]+/gi;

/**
 * @param {string} s
 * @returns {string}
 */
export function maskString(s) {
  if (typeof s !== "string") return s;

  let out = s;
  out = out.replace(EMAIL_RE, "[email]");
  out = out.replace(TOKEN_RE, "[redacted]");
  out = out.replace(HEX40_RE, "[redacted]");
  out = out.replace(BASE64_64_RE, "[redacted]");
  out = out.replace(IPV4_RE, "[redacted]");
  out = out.replace(DIGITS9_RE, "[redacted]");
  out = out.replace(POSIX_HOME_RE, "$1~");
  out = out.replace(WINDOWS_HOME_RE, "$1~");
  return out;
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function maskDeep(value) {
  if (typeof value === "string") return /** @type {T} */ (maskString(value));
  if (Array.isArray(value)) return /** @type {T} */ (value.map((item) => maskDeep(item)));
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = maskDeep(child);
    return /** @type {T} */ (out);
  }
  return value;
}

const SECRET_LIKE_RE = [
  EMAIL_RE,
  TOKEN_RE,
  HEX40_RE,
  BASE64_64_RE,
  IPV4_RE,
  DIGITS9_RE,
  POSIX_HOME_RE,
  WINDOWS_HOME_RE,
];

function hasSecretLikeValue(value) {
  return SECRET_LIKE_RE.some((pattern) => {
    pattern.lastIndex = 0;
    const found = pattern.test(value);
    pattern.lastIndex = 0;
    return found;
  });
}

function appendPath(pathValue, key) {
  if (typeof key === "number") return `${pathValue}[${key}]`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${pathValue}.${key}`
    : `${pathValue}[${JSON.stringify(key)}]`;
}

/**
 * Return JSON paths whose string values still look like sensitive data.
 * @param {unknown} value
 * @returns {string[]}
 */
export function findSecretLike(value) {
  const paths = [];
  const seen = new WeakSet();

  function visit(current, currentPath) {
    if (typeof current === "string") {
      if (hasSecretLikeValue(current)) paths.push(currentPath);
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, appendPath(currentPath, index)));
    } else {
      Object.entries(current).forEach(([key, child]) => visit(child, appendPath(currentPath, key)));
    }
  }

  visit(value, "$" );
  return paths;
}
