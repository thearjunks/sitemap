const ITERATIONS = 210_000;
const bytesToHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const hexToBytes = hex => new Uint8Array(hex.match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) || []);

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, iterations, salt, expected] = encoded.split("$");
  if (algorithm !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations: Number(iterations) }, key, 256);
  const actual = new Uint8Array(bits);
  const expectedBytes = hexToBytes(expected);
  if (actual.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expectedBytes[index];
  return difference === 0;
}
