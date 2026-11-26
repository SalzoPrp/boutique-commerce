create table public.corviane_preview_orders (
  id uuid primary key,
  details jsonb not null,
  payment_id text unique,
  payment_status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.corviane_preview_orders enable row level security;
revoke all on public.corviane_preview_orders from anon, authenticated;
grant select, insert, update on public.corviane_preview_orders to service_role;
