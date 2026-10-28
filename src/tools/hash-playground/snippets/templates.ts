/**
 * Equivalent code for the operation the user just ran, in the other mainstream stacks.
 * Pure data + functions: no React, so adding a stack or algorithm is a local edit here.
 */

export type Stack = "csharp" | "node" | "python" | "java" | "go" | "php";

export const STACKS: { id: Stack; label: string; lang: string }[] = [
  { id: "csharp", label: "C# / .NET", lang: "csharp" },
  { id: "node", label: "Node.js", lang: "javascript" },
  { id: "python", label: "Python", lang: "python" },
  { id: "java", label: "Java", lang: "java" },
  { id: "go", label: "Go", lang: "go" },
  { id: "php", label: "PHP", lang: "php" },
];

export type SnippetSpec =
  | { kind: "digest"; hash: string }
  | { kind: "hmac"; hash: string }
  | { kind: "bcrypt"; workFactor: number }
  | { kind: "argon2id"; memoryKb: number; iterations: number; parallelism: number }
  | { kind: "pbkdf2"; iterations: number }
  | { kind: "aesgcm" };

export interface Snippet {
  code: string;
  /** Interoperability remark shown under the code. */
  note: string;
}

const UP = (h: string) => h.toUpperCase();
const JAVA_MD = (h: string) => `SHA-${h.slice(3)}`;
const GO_SHA = (h: string) => ({
  pkg: h === "sha256" ? "crypto/sha256" : "crypto/sha512",
  sum: `${h === "sha256" ? "sha256" : "sha512"}.Sum${h.slice(3)}`,
  ctor: h === "sha256" ? "sha256.New" : h === "sha384" ? "sha512.New384" : "sha512.New",
});

function digest({ hash }: { hash: string }): Record<Stack, string> {
  const go = GO_SHA(hash);
  return {
    csharp: `using System.Security.Cryptography;
using System.Text;

byte[] digest = ${UP(hash)}.HashData(Encoding.UTF8.GetBytes(input));
string hex = Convert.ToHexStringLower(digest);`,
    node: `import { createHash } from "node:crypto";

const hex = createHash("${hash}").update(input, "utf8").digest("hex");`,
    python: `import hashlib

hex_digest = hashlib.${hash}(input.encode("utf-8")).hexdigest()`,
    java: `import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

MessageDigest md = MessageDigest.getInstance("${JAVA_MD(hash)}");
String hex = HexFormat.of().formatHex(md.digest(input.getBytes(StandardCharsets.UTF_8)));`,
    go: `import (
	"${go.pkg}"
	"encoding/hex"
)

sum := ${go.sum}([]byte(input))
digest := hex.EncodeToString(sum[:])`,
    php: `$hex = hash('${hash}', $input);`,
  };
}

function hmac({ hash }: { hash: string }): Record<Stack, string> {
  const go = GO_SHA(hash);
  return {
    csharp: `using System.Security.Cryptography;
using System.Text;

byte[] mac = HMAC${UP(hash)}.HashData(Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(message));
// Compare tags with CryptographicOperations.FixedTimeEquals(mac, expected)`,
    node: `import { createHmac, timingSafeEqual } from "node:crypto";

const mac = createHmac("${hash}", key).update(message).digest();
// Compare tags with timingSafeEqual(mac, expected)`,
    python: `import hashlib
import hmac

mac = hmac.new(key.encode(), message.encode(), hashlib.${hash}).digest()
# Compare tags with hmac.compare_digest(mac, expected)`,
    java: `import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

Mac mac = Mac.getInstance("HmacSHA${hash.slice(3)}");
mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA${hash.slice(3)}"));
byte[] tag = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
// Compare tags with MessageDigest.isEqual(tag, expected)`,
    go: `import (
	"crypto/hmac"
	"${go.pkg}"
)

m := hmac.New(${go.ctor}, []byte(key))
m.Write([]byte(message))
tag := m.Sum(nil)
// Compare tags with hmac.Equal(tag, expected)`,
    php: `$mac = hash_hmac('${hash}', $message, $key, true);
// Compare tags with hash_equals($expected, $mac)`,
  };
}

function bcrypt({ workFactor: w }: { workFactor: number }): Record<Stack, string> {
  return {
    csharp: `// dotnet add package BCrypt.Net-Next
string hash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: ${w});
bool ok = BCrypt.Net.BCrypt.Verify(password, hash);`,
    node: `// npm i bcrypt
import bcrypt from "bcrypt";

const hash = await bcrypt.hash(password, ${w});
const ok = await bcrypt.compare(password, hash);`,
    python: `# pip install bcrypt
import bcrypt

hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=${w}))
ok = bcrypt.checkpw(password.encode(), hashed)`,
    java: `// org.springframework.security:spring-security-crypto
var encoder = new BCryptPasswordEncoder(${w});
String hash = encoder.encode(password);
boolean ok = encoder.matches(password, hash);`,
    go: `// go get golang.org/x/crypto/bcrypt
hash, err := bcrypt.GenerateFromPassword([]byte(password), ${w})
err = bcrypt.CompareHashAndPassword(hash, []byte(password)) // nil means match`,
    php: `$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => ${w}]);
$ok = password_verify($password, $hash);`,
  };
}

function argon2id({ memoryKb: m, iterations: t, parallelism: p }: { memoryKb: number; iterations: number; parallelism: number }): Record<Stack, string> {
  return {
    csharp: `// dotnet add package Konscious.Security.Cryptography.Argon2
byte[] salt = RandomNumberGenerator.GetBytes(16);
using var argon = new Argon2id(Encoding.UTF8.GetBytes(password))
{
    Salt = salt,
    MemorySize = ${m},          // KiB
    Iterations = ${t},
    DegreeOfParallelism = ${p},
};
byte[] hash = argon.GetBytes(32);`,
    node: `// npm i argon2
import argon2 from "argon2";

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: ${m}, // KiB
  timeCost: ${t},
  parallelism: ${p},
});
const ok = await argon2.verify(hash, password);`,
    python: `# pip install argon2-cffi
from argon2 import PasswordHasher

ph = PasswordHasher(time_cost=${t}, memory_cost=${m}, parallelism=${p})  # Argon2id by default
hashed = ph.hash(password)
ph.verify(hashed, password)  # raises VerifyMismatchError on failure`,
    java: `// Spring Security (also needs org.bouncycastle:bcprov-jdk18on)
var encoder = new Argon2PasswordEncoder(16, 32, ${p}, ${m}, ${t}); // saltLen, hashLen, parallelism, memory KiB, iterations
String hash = encoder.encode(password);
boolean ok = encoder.matches(password, hash);`,
    go: `// go get golang.org/x/crypto/argon2
salt := make([]byte, 16)
rand.Read(salt) // crypto/rand
hash := argon2.IDKey([]byte(password), salt, ${t}, ${m}, ${p}, 32) // time, memory KiB, threads, key length`,
    php: `$hash = password_hash($password, PASSWORD_ARGON2ID, [
    'memory_cost' => ${m}, // KiB
    'time_cost'   => ${t},
    'threads'     => ${p},
]);
$ok = password_verify($password, $hash);`,
  };
}

function pbkdf2({ iterations: i }: { iterations: number }): Record<Stack, string> {
  return {
    csharp: `byte[] salt = RandomNumberGenerator.GetBytes(16);
byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
    Encoding.UTF8.GetBytes(password), salt, ${i}, HashAlgorithmName.SHA256, 32);`,
    node: `import { pbkdf2Sync, randomBytes } from "node:crypto";

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ${i}, 32, "sha256");`,
    python: `import hashlib
import os

salt = os.urandom(16)
hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ${i}, dklen=32)`,
    java: `byte[] salt = new byte[16];
new SecureRandom().nextBytes(salt);
var spec = new PBEKeySpec(password.toCharArray(), salt, ${i}, 256); // key length in bits
byte[] hash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();`,
    go: `// go get golang.org/x/crypto/pbkdf2
salt := make([]byte, 16)
rand.Read(salt) // crypto/rand
hash := pbkdf2.Key([]byte(password), salt, ${i}, 32, sha256.New)`,
    php: `$salt = random_bytes(16);
$hash = hash_pbkdf2('sha256', $password, $salt, ${i}, 32, true);`,
  };
}

function aesgcm(): Record<Stack, string> {
  return {
    csharp: `byte[] key = RandomNumberGenerator.GetBytes(32);
byte[] iv = RandomNumberGenerator.GetBytes(12);   // new IV for every message
byte[] ciphertext = new byte[plaintext.Length];
byte[] tag = new byte[16];

using var aes = new AesGcm(key, tagSizeInBytes: 16);
aes.Encrypt(iv, plaintext, ciphertext, tag, aad);
// aes.Decrypt(iv, ciphertext, tag, plaintext, aad) throws if anything was modified`,
    node: `import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const key = randomBytes(32);
const iv = randomBytes(12); // new IV for every message
const cipher = createCipheriv("aes-256-gcm", key, iv);
cipher.setAAD(aad);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag(); // 16 bytes

// Decrypt: createDecipheriv(...), setAAD(aad), setAuthTag(tag); final() throws if tampered`,
    python: `# pip install cryptography
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

key = AESGCM.generate_key(bit_length=256)
iv = os.urandom(12)  # new IV for every message
sealed = AESGCM(key).encrypt(iv, plaintext, aad)  # ciphertext || 16-byte tag
plain = AESGCM(key).decrypt(iv, sealed, aad)      # raises InvalidTag if tampered`,
    java: `byte[] key = new byte[32], iv = new byte[12];
SecureRandom rng = new SecureRandom();
rng.nextBytes(key);
rng.nextBytes(iv); // new IV for every message

Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
c.updateAAD(aad);
byte[] sealed = c.doFinal(plaintext); // ciphertext || 16-byte tag`,
    go: `key := make([]byte, 32)
rand.Read(key) // crypto/rand
block, _ := aes.NewCipher(key)
gcm, _ := cipher.NewGCM(block)

iv := make([]byte, gcm.NonceSize()) // 12 bytes
rand.Read(iv)                       // new IV for every message
sealed := gcm.Seal(nil, iv, plaintext, aad)  // ciphertext || tag
plain, err := gcm.Open(nil, iv, sealed, aad) // err if tampered`,
    php: `$key = random_bytes(32);
$iv = random_bytes(12); // new IV for every message
$ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, $aad, 16);
$plain = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, $aad);`,
  };
}

const NOTES: Record<SnippetSpec["kind"], string> = {
  digest: "SHA-2 output is identical in every stack; only the hex/base64 encoding of the bytes is a presentation choice.",
  hmac: "Same key and message give the same tag everywhere. Always compare tags in constant time.",
  bcrypt: "The $2a$/$2b$/$2y$ string is universal: a hash created in one stack verifies in all the others.",
  argon2id: "The $argon2id$ PHC string carries its own salt and parameters, so it verifies across stacks. Memory is always in KiB.",
  pbkdf2: "PBKDF2 has no standard string format: store the salt, iteration count and hash function next to the hash (this app uses $pbkdf2-sha256$i=…$salt$hash).",
  aesgcm: "Wire layouts differ: .NET and Node keep the tag separate, while Java, Go and Python append it to the ciphertext. Agree on iv || ciphertext || tag when exchanging data.",
};

export function buildSnippets(spec: SnippetSpec): Record<Stack, Snippet> {
  const code: Record<Stack, string> = (() => {
    switch (spec.kind) {
      case "digest": return digest(spec);
      case "hmac": return hmac(spec);
      case "bcrypt": return bcrypt(spec);
      case "argon2id": return argon2id(spec);
      case "pbkdf2": return pbkdf2(spec);
      case "aesgcm": return aesgcm();
    }
  })();
  const note = NOTES[spec.kind];
  return Object.fromEntries(STACKS.map((s) => [s.id, { code: code[s.id], note }])) as Record<Stack, Snippet>;
}

/** Maps a password algorithm id + its parameters to a snippet spec (null if there is no template). */
export function passwordSpec(id: string, p: Record<string, number>): SnippetSpec | null {
  if (id === "bcrypt") return { kind: "bcrypt", workFactor: p.workFactor };
  if (id === "argon2id") return { kind: "argon2id", memoryKb: p.memoryKb, iterations: p.iterations, parallelism: p.parallelism };
  if (id === "pbkdf2") return { kind: "pbkdf2", iterations: p.iterations };
  return null;
}
