-- Speeds up the delivery log and the retry scheduler.
create index if not exists webhook_deliveries_endpoint_created on webhook_deliveries (endpoint_id, created_at desc);
