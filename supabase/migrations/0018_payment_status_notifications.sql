-- Link outbox-generated notices to their source event so retries remain idempotent.
alter table notifications add column event_id text;
create unique index notifications_event_id_unique
  on notifications(event_id);
