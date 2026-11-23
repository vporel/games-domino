"use server";

import { createHmac } from "node:crypto";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizePseudo, pseudoError, pseudoToEmail } from "@/lib/pseudo";

export type AuthState = { error: string | null };

/**
 * Accounts have no user-facing password: knowing a pseudo is enough to sign in as that player.
 * The Supabase password is therefore derived from the pseudo with this constant, which is not a
 * real secret (anyone reading the code can reproduce it, gaining nothing more than the login page
 * already gives).
 *
 * Supabase accounts are SHARED with Ludo (same project, same technical email): this constant and
 * the derivation must stay identical to Ludo's (`../ludo/src/app/actions/auth.ts`), and NEVER
 * change once accounts exist, or every existing player would be locked out.
 * Any feature needing real per-player security (a PIN, private data, payments...) must replace
 * this scheme with a server-side secret first.
 */
const PSEUDO_PASSWORD_SALT = "games.vporel.com/pseudo-auth/v1";

function derivePassword(pseudo: string): string {
  return createHmac("sha256", PSEUDO_PASSWORD_SALT).update(pseudo).digest("base64url");
}

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function signIn(pseudo: string): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: pseudoToEmail(pseudo),
    password: derivePassword(pseudo),
  });
  return error ? null : data.user?.id ?? null;
}

/** Creates the Domino profile of a signed-in account if it has none yet (e.g. a Ludo player). */
async function ensureProfile(userId: string, pseudo: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from("domino_profiles").insert({ id: userId, pseudo });
  return !error || error.code === "23505";
}

export async function register(_prev: AuthState, form: FormData): Promise<AuthState> {
  const pseudo = normalizePseudo(String(form.get("pseudo") ?? ""));
  const invalid = pseudoError(pseudo);
  if (invalid) return { error: invalid };

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("domino_profiles").select("id").eq("pseudo", pseudo).maybeSingle();
  if (existing) return { error: "Ce pseudo est déjà pris." };

  const { error: createError } = await admin.auth.admin.createUser({
    email: pseudoToEmail(pseudo),
    password: derivePassword(pseudo),
    email_confirm: true,
    user_metadata: { pseudo, app: "domino" },
  });
  // The account may already exist (a Ludo player, or an interrupted sign-up): it is reused below.
  if (createError && !/already|registered|exists/i.test(createError.message)) {
    return { error: "Impossible de créer le compte. Réessaie." };
  }

  const userId = await signIn(pseudo);
  if (!userId) return { error: createError ? "Ce pseudo est déjà pris." : "Compte créé, mais la connexion a échoué. Essaie de te connecter." };
  if (!(await ensureProfile(userId, pseudo))) return { error: "Impossible de créer le profil. Réessaie." };
  redirect(safeNext(form.get("next")));
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const pseudo = normalizePseudo(String(form.get("pseudo") ?? ""));
  const invalid = pseudoError(pseudo);
  if (invalid) return { error: invalid };

  const userId = await signIn(pseudo);
  if (!userId) return { error: "Pseudo inconnu. Crée un compte d'abord." };
  if (!(await ensureProfile(userId, pseudo))) return { error: "Connexion impossible. Réessaie." };
  redirect(safeNext(form.get("next")));
}

export async function logout(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
