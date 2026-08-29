-- ============================================================================
-- Historial de conversación del Asistente por contacto (ManyChat manda un
-- mensaje por vez, sin memoria). Se registra cada ida y vuelta para: (1) darle
-- CONTEXTO a la IA (conversación con memoria), y (2) armar el hilo de /consultas
-- con toda la charla previa cuando el bot deriva a una persona.
-- ============================================================================
create table if not exists asistente_historial (
    id            uuid primary key default gen_random_uuid(),
    subscriber_id text not null,                          -- ID de contacto en ManyChat
    canal         text not null default 'instagram',      -- instagram / whatsapp
    de            text not null check (de in ('usuario', 'bot')),
    texto         text not null,
    created_at    timestamptz not null default now()
);
create index if not exists idx_asist_hist on asistente_historial (subscriber_id, created_at desc);

alter table asistente_historial enable row level security;

-- Permitir mensajes del bot en el hilo de la consulta (antes solo usuario/recep).
alter table asistente_consulta_mensajes drop constraint if exists asistente_consulta_mensajes_de_check;
alter table asistente_consulta_mensajes add constraint asistente_consulta_mensajes_de_check
    check (de in ('usuario', 'recep', 'bot'));
