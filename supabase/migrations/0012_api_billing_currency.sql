alter table api_subscriptions
  drop constraint if exists api_subscriptions_billing_currency_check;
alter table api_subscriptions
  add constraint api_subscriptions_billing_currency_check check (billing_currency in ('NGN', 'USD'));

alter table api_billing_checkout_attempts
  drop constraint if exists api_billing_checkout_attempts_billing_currency_check;
alter table api_billing_checkout_attempts
  add constraint api_billing_checkout_attempts_billing_currency_check check (billing_currency in ('NGN', 'USD'));
