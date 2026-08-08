import { hash, verify } from "argon2";

const ARGON_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return verify(hash, password);
}

// Common password check — basic implementation
const COMMON_PASSWORDS = new Set([
  "password", "password123", "1234567890", "qwerty12345",
  "12345678", "football", "football123", "nacos12345",
]);

export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  return COMMON_PASSWORDS.has(lower);
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return "Password must be at least 10 characters.";
  }
  if (isCommonPassword(password)) {
    return "Password is too common. Please choose a stronger password.";
  }
  return null;
}