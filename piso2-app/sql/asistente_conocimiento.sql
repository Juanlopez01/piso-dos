-- Base de conocimiento del asistente, cargada por el equipo desde /consultas.
-- tipo = 'info'         → dato/contexto que el bot DEBE saber (se le pasa a la IA).
-- tipo = 'no_responder' → tema del que el bot NO debe hablar (deriva al equipo).
create table if not exists asistente_conocimiento (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('info','no_responder')),
  texto      text not null,
  activo     boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_asist_conoc_activo on asistente_conocimiento(activo);
alter table asistente_conocimiento enable row level security;
