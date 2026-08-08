"use server";

import { signIn, signOut } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { hashPassword, validatePassword } from "@/lib/auth/password";

export async function signUpAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const displayName = formData.get("displayName") as string;
  const handle = formData.get("handle") as string;

  if (!email || !password || !displayName || !handle) {
    return { error: "All fields are required." };
  }

  // Validate handle format
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
    return { error: "Handle must be 3-20 characters: lowercase letters, numbers, underscores." };
  }

  // Validate password
  const pwError = validatePassword(password);
  if (pwError) return { error: pwError };

  // Check existing
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { handle }] },
  });
  if (existing) {
    return { error: existing.email === email ? "Email already registered." : "Handle already taken." };
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: { email, passwordHash, displayName, handle },
  });

  // Sign in after signup
  await signIn("credentials", { email, password, redirect: false });

  return { success: true };
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
    return { success: true };
  } catch (e) {
    return { error: "Invalid email or password." };
  }
}

export async function signOutAction() {
  await signOut({ redirect: false });
}