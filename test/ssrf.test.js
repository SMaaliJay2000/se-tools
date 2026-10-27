import test from "node:test";
import assert from "node:assert/strict";
import { isBlockedIp, validateTarget } from "../server/lib/ssrf.js";

delete process.env.ALLOW_PRIVATE_TARGETS;

test("blocks private, loopback, link-local and reserved IPv4", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
});

test("allows public IPv4", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"]) assert.equal(isBlockedIp(ip), false, ip);
});

test("blocks private IPv6 and embedded IPv4 forms", () => {
  for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "2002:7f00:1::", "ff02::1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
});

test("allows public IPv6", () => {
  for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) assert.equal(isBlockedIp(ip), false, ip);
});

test("rejects dangerous URLs", () => {
  const bad = [
    "http://localhost/", "http://foo.localhost/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/",
    "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://metadata/",
    "http://router.local/", "http://example.com:22/", "http://example.com:6379/", "ftp://example.com/",
    "file:///etc/passwd", "http://user:pw@example.com/", "not a url",
  ];
  for (const u of bad) assert.throws(() => validateTarget(u), { name: "BlockedTargetError" }, u);
});

test("accepts normal public URLs", () => {
  for (const u of ["https://example.com", "http://example.com:8080/x?y=1", "https://8.8.8.8/"]) {
    assert.doesNotThrow(() => validateTarget(u), u);
  }
});
