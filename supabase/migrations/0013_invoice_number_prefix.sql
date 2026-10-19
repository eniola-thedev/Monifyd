alter table invoices
  alter column invoice_number
  set default ('INMF-' || lpad(nextval('invoice_number_seq')::text, 6, '0'));
