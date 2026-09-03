const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#_-";

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function credentialKeyBytes() {
  const encodedKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
  }

  const keyBytes = base64ToBytes(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must contain 32 bytes");
  }
  return keyBytes;
}

export function generateSshPassword(length = 28) {
  const random = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(
    random,
    (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length],
  ).join("");
}

export async function encryptCredential(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    credentialKeyBytes(),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );

  return {
    encrypted: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptCredential(encrypted: string, encodedIv: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    credentialKeyBytes(),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encodedIv) },
    key,
    base64ToBytes(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

export async function deriveGatewayApiKey() {
  const key = await crypto.subtle.importKey(
    "raw",
    credentialKeyBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("c3-protect-remote/gateway-api/v1"),
  );
  return bytesToHex(new Uint8Array(signature));
}
