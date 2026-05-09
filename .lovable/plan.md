# Wave 3 — Security hardening + critical bug fixes

This is a large bundle. I'll group by area. After your approval I'll execute end-to-end.

## A. Critical security fixes (database + RLS)

1. **`payments` table** — replace `payments_update_own_pending` so users can only update `screenshot_path`, `tx_hash`, `wallet_address`, `notes`. `status`, `credits`, `amount_usdt`, `confirmed_by`, `confirmed_at` become admin-only via a trigger that blocks non-admin changes to those columns.
2. **`password_reset_requests`** — drop `prr_insert_anyone`. New policy: authenticated users only, `user_id = auth.uid()` AND `email = auth.email()`. Anonymous insertion removed → forgot-password flow now requires the user to be signed in OR uses a public edge function with rate-limit + captcha (we keep it simple: require sign-in is impractical, so I'll move the insert into a captcha-protected edge function `request-password-reset` that uses service role).
3. **Storage `payment-screenshots`** — add owner-scoped DELETE/UPDATE policies.
4. **Storage `avatars` (public)** — narrow SELECT so listing is blocked (`USING (true)` only allows reads of known paths anyway, but tighten).
5. **`SECURITY DEFINER` functions** — `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` for `handle_new_user`, `auto_admin_on_signup`, `promote_to_admin_by_email`, `set_updated_at` (these are trigger-only). Keep `has_role` callable.
6. **Atomic credit deduction** — new SQL function `consume_credit(_user uuid)` returns boolean, runs `UPDATE credits SET balance = balance - 1 WHERE user_id=_user AND balance>0 RETURNING true`. Editor calls this RPC instead of read-then-update.
7. **Atomic payment confirmation** — new function `admin_confirm_payment(_payment uuid)` (admin-only) updates status + credits in one transaction with a credit_ledger entry. Admin panel uses this.

## B. Edge function security

8. **`notify-admin-payment`** — require valid JWT (`getClaims`), validate body with zod, escape HTML output, and verify the `user_id` in body matches the caller.
9. **New `request-password-reset`** edge function — verify hCaptcha token, rate-limit by IP (simple in-memory + DB cooldown), look up user by email via service role, insert reset request. Replaces direct insert from `Auth.tsx`.
10. **New `admin-email-reset-link`** edge function — when admin clicks "Reset", instead of setting password to a known string, generate a Supabase recovery link via `admin.generateLink({type:'recovery'})` and email it via Resend. The default-password flow is removed entirely (fixes "default password disclosed" finding).

## C. Auth UI changes

11. Remove the literal "dorjijamtse" text from `Auth.tsx` and `ChangePassword.tsx`. Forgot-password copy becomes "An email with a reset link will be sent to you after admin approval."
12. **Replace test hCaptcha key**: I'll add `VITE_HCAPTCHA_SITE_KEY` reading. Since I can't get a real key, I'll add it as a public env var with a clear inline comment + UI fallback. Provide instructions; ship with the test key but flag it. *(If you have a real hCaptcha site key, paste it after approval and I'll wire it in.)*

## D. Editor / PDF fixes

13. **PDF open speed** — Templates page currently downloads the whole PDF before navigating. Switch to passing the storage path and let Editor stream-load in parallel with rendering; show a skeleton while loading. Cache `pdfjs` worker.
14. **Checkbox tick → cross on export** — current export draws an "X" instead of a check glyph. Fix `exportPdf.ts` to draw a proper check mark using two line segments (`drawLine`) so what you see is what you get.
15. **Text drift ~5mm above on export** — baseline math in `exportPdf.ts` uses `ph - o.y - o.fontSize` but the on-screen overlay positions text with its top at `o.y` and renders inside a box of height `o.h`. Replace baseline calc with `ph - o.y - (o.fontSize * 0.85)` matching the on-screen line-box, and account for line-height. I'll measure against the rendered DOM box to make WYSIWYG exact.
16. **Cross-page overlay drag** — replace the always-visible page-jump arrows with: (a) selecting an overlay shows a small popover with "Move to page ▾" dropdown, (b) when you click on a target page in the page list while an overlay is selected it moves there. Removes the need to drag down through pages.

## E. Admin panel

17. **Show user email next to payment requests** — already fetched via `admin-list-users`; join into payments query.
18. **Show payment screenshot** — admin can click to view a signed URL of the screenshot.
19. **Template management for admin** — new tab "Templates": list all `templates` rows, upload PDF + title/category/description, delete, replace PDF (re-upload to same row). Uses `template-pdfs` public bucket.
20. **Reset action** — change from "set to default password" to "Send reset email" (calls `admin-email-reset-link`). Removes the disclosed-default issue.

## F. DDoS / bot mitigation

21. Real hCaptcha site key (your action — paste it). Until then, captcha is bypassed by the test key.
22. Rate-limit auth + reset edge functions: 5 attempts per IP per 15 min (track in a small `rate_limits` table).
23. Add `x-ratelimit-*` headers; clients show "Try again later" toasts.

## Technical notes

- Migration is large — I'll split into a few logical migrations.
- The "default password" feature is fully removed. Existing users with `must_change_password=true` are unaffected; new resets use a one-time email link.
- I will NOT add a real hCaptcha key — you must supply one. Test key stays until then.
- I will not implement IP-based DDoS at the CDN layer (out of scope); the rate-limit table is the in-app guard.

## Out of scope for this wave (next wave if you want)

- Profile + payments polish (BoB logo already added, dual currency already added — just verify)
- Screenshot prevention (you said skip)
- Workspace-wide WAF / Cloudflare turnstile

---

**Approve and I'll ship this in one go**, or tell me which sections to drop.