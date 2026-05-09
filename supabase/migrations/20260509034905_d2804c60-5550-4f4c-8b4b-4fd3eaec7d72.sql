
-- 1. Tighten payments: trigger blocks non-admin from changing protected fields
CREATE OR REPLACE FUNCTION public.payments_guard_protected_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.status      IS DISTINCT FROM OLD.status      THEN RAISE EXCEPTION 'Not allowed to change status'; END IF;
  IF NEW.credits     IS DISTINCT FROM OLD.credits     THEN RAISE EXCEPTION 'Not allowed to change credits'; END IF;
  IF NEW.amount_usdt IS DISTINCT FROM OLD.amount_usdt THEN RAISE EXCEPTION 'Not allowed to change amount'; END IF;
  IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.user_id     IS DISTINCT FROM OLD.user_id     THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.method      IS DISTINCT FROM OLD.method      THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payments_guard_protected_fields ON public.payments;
CREATE TRIGGER payments_guard_protected_fields
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_guard_protected_fields();

-- 2. password_reset_requests: lock down INSERT — never allow setting user_id from client
DROP POLICY IF EXISTS prr_insert_anyone ON public.password_reset_requests;
CREATE POLICY prr_insert_public ON public.password_reset_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL);
-- Drop self-select so users can't enumerate. Admin can still see all.
DROP POLICY IF EXISTS prr_select_own ON public.password_reset_requests;

-- 3. Storage policies for payment-screenshots: explicit owner DELETE/UPDATE
CREATE POLICY "payment_screenshots_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "payment_screenshots_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4. Atomic credit consumption
CREATE OR REPLACE FUNCTION public.consume_credit(_user uuid, _ref uuid, _note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated int;
BEGIN
  IF _user IS NULL OR _user <> auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.credits SET balance = balance - 1, updated_at = now()
   WHERE user_id = _user AND balance > 0;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN RETURN false; END IF;
  INSERT INTO public.credit_ledger (user_id, delta, kind, reference_id, note)
  VALUES (_user, -1, 'spend', _ref, _note);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_credit(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid, uuid, text) TO authenticated;

-- 5. Atomic admin confirm payment
CREATE OR REPLACE FUNCTION public.admin_confirm_payment(_payment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment FOR UPDATE;
  IF NOT FOUND OR p.status <> 'pending' THEN RAISE EXCEPTION 'not pending'; END IF;
  INSERT INTO public.credits (user_id, balance, updated_at)
    VALUES (p.user_id, p.credits, now())
    ON CONFLICT (user_id) DO UPDATE SET balance = public.credits.balance + EXCLUDED.balance, updated_at = now();
  INSERT INTO public.credit_ledger (user_id, delta, kind, reference_id, note)
    VALUES (p.user_id, p.credits, 'purchase', p.id, concat('payment ', p.method, ' ', p.amount_usdt));
  UPDATE public.payments SET status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE id = _payment;
END $$;
REVOKE ALL ON FUNCTION public.admin_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_payment(_payment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payments SET status = 'rejected', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE id = _payment AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.admin_reject_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment(uuid) TO authenticated;

-- 6. Lock down trigger-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_admin_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_to_admin_by_email(text) FROM PUBLIC, anon, authenticated;
