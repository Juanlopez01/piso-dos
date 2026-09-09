-- Hand-off del asistente: cuando la recep responde una consulta, el bot deja de
-- contestarle a ese contacto por un rato (para no pisar al humano).
create table if not exists asistente_pausa (
  subscriber_id text primary key,
  pausado_hasta timestamptz not null,
  updated_at    timestamptz not null default now()
);
alter table asistente_pausa enable row level security;
