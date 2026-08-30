// =====================================================
// CREDENTIAL ENCRYPTION AT REST
// Tenant HMAC secrets are stored in D1 only as AES-GCM
// ciphertext. The key (KEK) lives solely as a Worker
// secret on this control-plane Worker — never in D1,
// never shipped to the dashboard frontend.
// =====================================================

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function importKek(env) {
  const kekB64 = env.CREDENTIAL_KEK;
  if (!kekB64) {
    throw new Error("CREDENTIAL_KEK secret is not configured");
  }
  const rawKey = base64ToBytes(kekB64);
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}

/**
 * Encrypts a plaintext secret. Returns base64 ciphertext + base64 iv.
 */
export async function encryptSecret(env, plaintext) {
  const key = await importKek(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    encryptedSecret: bytesToBase64(new Uint8Array(ciphertext)),
    secretIv: bytesToBase64(iv)
  };
}

/**
 * Decrypts a stored secret back to plaintext. Only ever called
 * server-side, immediately before signing an outbound request to
 * a tenant — the plaintext is never returned to the dashboard.
 */
export async function decryptSecret(env, encryptedSecretB64, secretIvB64) {
  const key = await importKek(env);
  const iv = base64ToBytes(secretIvB64);
  const ciphertext = base64ToBytes(encryptedSecretB64);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Generates a new random HMAC secret (for tenant credential
 * creation/rotation). 32 random bytes, hex-encoded.
 */
export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
