import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from "crypto";

/**
 * WireGuard keys are raw 32-byte Curve25519 keys, base64 (standard) encoded.
 * Node exposes X25519 natively: export as JWK and re-encode "d" / "x" from base64url.
 */
export function wgKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const priv = privateKey.export({ format: "jwk" }) as { d?: string };
  const pub = publicKey.export({ format: "jwk" }) as { x?: string };
  if (!priv.d || !pub.x) throw new Error("x25519 export failed");
  return {
    privateKey: Buffer.from(priv.d, "base64url").toString("base64"),
    publicKey: Buffer.from(pub.x, "base64url").toString("base64"),
  };
}

export function wgPresharedKey(): string {
  return randomBytes(32).toString("base64");
}

function key(): Buffer {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s || s.length < 16) throw new Error("ENCRYPTION_SECRET missing");
  return createHash("sha256").update(s).digest();
}

/** AES-256-GCM, output "iv.tag.ciphertext" in base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function decrypt(enc: string): string {
  const [iv, tag, ct] = enc.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
