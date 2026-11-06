create or replace function public.transition_payment_state(
  p_payment_id text,
  p_from_status text,
  p_to_status text,
  p_received_amount numeric default null,
  p_confirmations integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_invoice invoices%rowtype;
  v_allowed boolean := false;
  v_event_type text;
begin
  v_allowed := case p_from_status
    when 'CREATED' then p_to_status in ('AWAITING_PAYMENT', 'CANCELLED', 'EXPIRED')
    when 'AWAITING_PAYMENT' then p_to_status in ('PAYMENT_DETECTED', 'EXPIRED', 'CANCELLED', 'FAILED')
    when 'PAYMENT_DETECTED' then p_to_status in ('CONFIRMING', 'UNDERPAID', 'OVERPAID', 'FAILED')
    when 'CONFIRMING' then p_to_status in ('PAID', 'UNDERPAID', 'OVERPAID', 'FAILED')
    when 'UNDERPAID' then p_to_status in ('PAID', 'EXPIRED')
    when 'EXPIRED' then p_to_status = 'PAYMENT_DETECTED'
    else false
  end;
  if not v_allowed then raise exception 'Payment status transition is not allowed.'; end if;
  if p_received_amount is not null and p_received_amount < 0 then raise exception 'Received amount cannot be negative.'; end if;
  if p_confirmations is not null and p_confirmations < 0 then raise exception 'Confirmation count cannot be negative.'; end if;

  update payments
  set status = p_to_status::payment_status,
      received_amount = coalesce(p_received_amount, received_amount),
      confirmations = coalesce(p_confirmations, confirmations),
      detected_at = case when p_to_status = 'PAYMENT_DETECTED' then now() else detected_at end,
      confirmed_at = case when p_to_status = 'PAID' then now() else confirmed_at end
  where id = p_payment_id and status = p_from_status::payment_status
  returning * into v_payment;
  if not found then return null; end if;

  insert into payment_status_log (payment_id, from_status, to_status)
  values (v_payment.id, p_from_status::payment_status, p_to_status::payment_status);

  v_event_type := case p_to_status
    when 'PAYMENT_DETECTED' then 'payment.detected'
    when 'CONFIRMING' then 'payment.confirming'
    when 'UNDERPAID' then 'payment.underpaid'
    when 'OVERPAID' then 'payment.overpaid'
    when 'EXPIRED' then 'payment.expired'
    when 'FAILED' then 'payment.failed'
    else null
  end;
  if v_event_type is not null then
    perform enqueue_domain_event(v_payment.merchant_id, v_event_type, 'payment', to_jsonb(v_payment));
  end if;

  if p_to_status in ('UNDERPAID', 'OVERPAID') and v_payment.invoice_id is not null then
    update invoices set status = p_to_status::invoice_status, updated_at = now()
    where id = v_payment.invoice_id returning * into v_invoice;
    if found then
      perform enqueue_domain_event(v_payment.merchant_id, 'invoice.' || lower(p_to_status), 'invoice', to_jsonb(v_invoice));
    end if;
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'invoice', case when v_payment.invoice_id is not null and p_to_status in ('UNDERPAID', 'OVERPAID') then to_jsonb(v_invoice) else null end
  );
end;
$$;

revoke all on function public.transition_payment_state(text, text, text, numeric, integer) from public, anon, authenticated;
grant execute on function public.transition_payment_state(text, text, text, numeric, integer) to service_role;

notify pgrst, 'reload schema';
