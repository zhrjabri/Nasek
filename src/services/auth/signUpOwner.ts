import { supabase } from '@/services/supabase/client'
import { authRedirectTarget } from './redirect'
import type { PasswordError } from './password'

/**
 * Creating the sign-in half of a campaign owner's account.
 *
 * Only the sign-in half, and the split is forced by the project rather than
 * chosen: `mailer_autoconfirm` is off, so `signUp` sends a confirmation email
 * and returns no session. Nothing that needs a signed-in caller —
 * `register_provider`, the permit upload into a private bucket keyed on
 * `auth.uid()` — can run until the owner has followed that link. So this is
 * step one of two, and the portal says so on the screen.
 *
 * Keeping the confirmation is deliberate. The address is how NASEK reaches a
 * company about its verification, and an unverified address means a company in
 * the queue that cannot be told the outcome.
 *
 * WHAT IS NOT STORED
 *
 * The password goes to Supabase and nowhere else. It is not written to
 * `providers`, not to `profiles`, not to `localStorage`, and this function
 * never sees it again after the call below. There is no query anywhere in this
 * repository that reads a credential out of a NASEK table, and there must never
 * be one — a company's own record holds contact details, not secrets.
 */

export type OwnerSignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: PasswordError }

/** Supabase's error text, reduced to something the interface can act on. */
function classify(message: string): PasswordError {
  const text = message.toLowerCase()
  if (/already registered|already exists|user already/.test(text)) return 'email_taken'
  if (/password|pwned|leaked|characters/.test(text)) return 'weak_password'
  if (/rate|too many|seconds/.test(text)) return 'rate_limited'
  if (/signups? (are )?disabled/.test(text)) return 'failed'
  return 'failed'
}

export async function signUpOwner(
  email: string,
  password: string,
): Promise<OwnerSignUpResult> {
  if (!supabase) return { ok: false, error: 'offline' }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      /*
       * Back to this portal, not to the public site.
       *
       * `authRedirectTarget()` is built from the address the page is served on,
       * so an owner confirming from the portal lands back in the portal. The
       * project's Site URL is the customer site, and without this the
       * confirmation would drop a new owner onto a pilgrim's home page with a
       * session they could not use for anything they came to do.
       */
      emailRedirectTo: authRedirectTarget(),
    },
  })

  if (error) return { ok: false, error: classify(error.message) }

  /*
   * A session here would mean confirmation is switched off on the project.
   *
   * The portal handles both: with a session the owner goes straight to the
   * company form, without one they are told to check their email. Reading it
   * from the response rather than assuming means turning `mailer_autoconfirm`
   * on later needs no change here.
   */
  return { ok: true, needsEmailConfirmation: !data.session }
}
