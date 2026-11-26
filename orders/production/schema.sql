begin;

create table public.corviane_live_orders (
  id uuid primary key,
  details jsonb not null,
  payment_id text unique,
  payment_status text not null default 'open'
    check (payment_status in ('open','pending','authorized','paid','failed','canceled','expired')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.corviane_confirmation_outbox (
  order_id uuid primary key references public.corviane_live_orders(id),
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text
);

alter table public.corviane_live_orders enable row level security;
alter table public.corviane_confirmation_outbox enable row level security;
revoke all on public.corviane_live_orders, public.corviane_confirmation_outbox from anon, authenticated;
grant select, insert, update on public.corviane_live_orders to service_role;
grant select, insert, update on public.corviane_confirmation_outbox to service_role;

create function public.corviane_queue_paid_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    insert into public.corviane_confirmation_outbox (order_id) values (new.id)
      on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger corviane_queue_paid_confirmation
before update of payment_status on public.corviane_live_orders
for each row execute function public.corviane_queue_paid_confirmation();

commit;
