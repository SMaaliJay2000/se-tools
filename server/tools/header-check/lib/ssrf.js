import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

export class BlockedTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedTargetError";
  }
}

// Set ALLOW_PRIVATE_TARGETS=true for local development and tests only.
const allowPrivate = () => process.env.ALLOW_PRIVATE_TARGETS === "true";
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const UA = "HeaderCheck/1.0 (security header analyzer)";

/* ---------- IP classification ---------- */

const v4ToInt = (ip) => ip.split(".").reduce((acc, o) => (acc << 8n) | BigInt(o), 0n);

function v6ToInt(addr) {
  addr = addr.split("%")[0];
  if (addr.includes(".")) {
    const i = addr.lastIndexOf(":");
    const p = addr.slice(i + 1).split(".").map(Number);
    addr = addr.slice(0, i + 1) + (((p[0] << 8) | p[1]).toString(16)) + ":" + (((p[2] << 8) | p[3]).toString(16));
  }
  const [head, rest] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = rest ? rest.split(":") : [];
  const groups = rest === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g || "0", 16)), 0n);
}

const inCidr = (value, base, bits, total) => value >> BigInt(total - bits) === base >> BigInt(total - bits);

const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([ip, bits]) => [v4ToInt(ip), bits]);

const V6_BLOCKED = [
  ["::", 96], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
  ["2001::", 32], ["2001:db8::", 32], ["100::", 64],
].map(([ip, bits]) => [v6ToInt(ip), bits]);

const MAPPED = v6ToInt("::ffff:0:0");
const NAT64 = v6ToInt("64:ff9b::");
const SIXTOFOUR = v6ToInt("2002::");

const blockedV4 = (v) => V4_BLOCKED.some(([b, bits]) => inCidr(v, b, bits, 32));

export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return blockedV4(v4ToInt(ip));
  if (net.isIPv6(ip)) {
    const v = v6ToInt(ip);
    if (V6_BLOCKED.some(([b, bits]) => inCidr(v, b, bits, 128))) return true;
    if (inCidr(v, MAPPED, 96, 128) || inCidr(v, NAT64, 96, 128)) return blockedV4(v & 0xffffffffn);
    if (inCidr(v, SIXTOFOUR, 16, 128)) return blockedV4((v >> 80n) & 0xffffffffn);
    return false;
  }
  return true; // unknown format: block
}

/* ---------- URL validation ---------- */

export function validateTarget(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedTargetError("That doesn't look like a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new BlockedTargetError("Only http and https URLs can be scanned.");
  }
  if (u.username || u.password) {
    throw new BlockedTargetError("URLs with embedded credentials are not allowed.");
  }
  if (!allowPrivate()) {
    if (!ALLOWED_PORTS.has(u.port)) {
      throw new BlockedTargetError(`Port ${u.port} is not allowed. Use 80, 443, 8080 or 8443.`);
    }
    const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isIp = net.isIP(host) !== 0;
    if (
      host === "localhost" ||
      /\.(localhost|local|internal|lan|home|corp)$/.test(host) ||
      (!isIp && !host.includes("."))
    ) {
      throw new BlockedTargetError("Local and internal hostnames can't be scanned.");
    }
    if (isIp && isBlockedIp(host)) {
      throw new BlockedTargetError("Private and reserved IP addresses can't be scanned.");
    }
  }
  return u;
}

/* ---------- Pinned DNS lookup (defeats DNS rebinding) ---------- */

function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err);
    if (!allowPrivate() && addresses.some((a) => isBlockedIp(a.address))) {
      return cb(new BlockedTargetError("That host resolves to a private or reserved IP address."));
    }
    if (options && options.all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
}

/* ---------- Single request (headers only, body is discarded) ---------- */

function readTls(socket) {
  if (!socket || typeof socket.getPeerCertificate !== "function") return null;
  const cert = socket.getPeerCertificate();
  const validTo = cert && cert.valid_to ? new Date(cert.valid_to) : null;
  return {
    protocol: socket.getProtocol ? socket.getProtocol() : null,
    authorized: socket.authorized,
    subject: cert?.subject?.CN || null,
    issuer: cert?.issuer?.O || cert?.issuer?.CN || null,
    validTo: validTo && !isNaN(validTo) ? validTo.toISOString() : null,
    daysLeft: validTo && !isNaN(validTo) ? Math.floor((validTo - Date.now()) / 86400000) : null,
  };
}

export function request(u, { method = "GET", headers = {}, timeoutMs = 8000, insecure = false } = {}) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const started = Date.now();
    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(val);
    };
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ""),
        port: u.port || undefined,
        path: u.pathname + u.search,
        method,
        headers: { "user-agent": UA, accept: "*/*", ...headers },
        lookup: safeLookup,
        agent: false,
        rejectUnauthorized: !insecure,
      },
      (res) => {
        const tls = readTls(res.socket);
        const pairs = [];
        const map = {};
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          const name = res.rawHeaders[i];
          const value = res.rawHeaders[i + 1];
          pairs.push([name, value]);
          (map[name.toLowerCase()] ||= []).push(value);
        }
        res.on("error", () => {});
        res.destroy(); // we only need headers
        finish(resolve, {
          url: u.href,
          status: res.statusCode,
          statusText: res.statusMessage || "",
          headers: map,
          pairs,
          tls,
          ms: Date.now() - started,
        });
      }
    );
    const timer = setTimeout(() => {
      const err = Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" });
      req.destroy(err);
      finish(reject, err);
    }, timeoutMs);
    req.on("error", (e) => finish(reject, e));
    req.end();
  });
}

/* ---------- Redirect-following with re-validation on every hop ---------- */

const REDIRECT = new Set([301, 302, 303, 307, 308]);

export async function fetchChain(startUrl, { insecure = false, maxHops = 5, timeoutMs = 8000 } = {}) {
  const chain = [];
  let u = validateTarget(startUrl);
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await request(u, { insecure, timeoutMs });
    const location = res.headers.location?.[0];
    chain.push({ url: res.url, status: res.status, location: location || null });
    if (REDIRECT.has(res.status) && location) {
      if (hop === maxHops) throw new BlockedTargetError("Too many redirects.");
      u = validateTarget(new URL(location, u).href);
      continue;
    }
    return { res, chain, finalUrl: u };
  }
  throw new BlockedTargetError("Too many redirects.");
}
