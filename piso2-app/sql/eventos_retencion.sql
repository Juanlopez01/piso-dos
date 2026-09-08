-- ============================================================================
-- PISO2E · Fase retención: base de compradores + encuesta/reseñas + email
-- ============================================================================

-- Email del comprador en columna propia (antes el online lo guardaba mezclado
-- en comprador_contacto). Sirve para mandarle la entrada+QR y encuestas.
alter table evento_ventas add column if not exists comprador_email text;

-- Reseñas / encuesta post-función (form público → server action con service-role).
create table if not exists evento_resenas (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid references eventos(id) on delete cascade,
  nombre     text,
  rating     int check (rating between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);
create index if not exists idx_evento_resenas_evento on evento_resenas(evento_id);
-- RLS on sin policies (igual que el resto de eventos): solo service-role (las
-- server actions). El form público entra por una action, no directo.
alter table evento_resenas enable row level security;
