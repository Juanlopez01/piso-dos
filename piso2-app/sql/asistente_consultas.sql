-- ============================================================================
-- Consultas del Asistente (derivación a recepción). Cuando el bot deriva a una
-- persona, se guarda acá la consulta + el contacto de ManyChat. Recep las ve en
-- la app ("Consultas"), responde desde ahí (se envía al DM vía API de ManyChat)
-- y las marca resueltas.
-- ============================================================================
create table if not exists asistente_consultas (
    id             uuid primary key default gen_random_uuid(),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    canal          text not null default 'instagram',   -- instagram / whatsapp
    contacto_nombre   text,
    contacto_usuario  text,                              -- @handle de IG o teléfono
    subscriber_id     text,                              -- ID de contacto en ManyChat (para responder)
    consulta       text,                                 -- mensaje que disparó la derivación
    estado         text not null default 'pendiente'     -- pendiente / resuelta
                   check (estado in ('pendiente', 'resuelta')),
    resuelta_at    timestamptz,
    resuelta_por   uuid references profiles(id)
);
create index if not exists idx_asist_consultas_estado on asistente_consultas (estado, created_at desc);

-- Hilo de la conversación (la consulta inicial + las respuestas de recep).
create table if not exists asistente_consulta_mensajes (
    id           uuid primary key default gen_random_uuid(),
    consulta_id  uuid not null references asistente_consultas(id) on delete cascade,
    de           text not null check (de in ('usuario', 'recep')),
    texto        text not null,
    autor_id     uuid references profiles(id),           -- quién respondió (si de='recep')
    created_at   timestamptz not null default now()
);
create index if not exists idx_asist_consulta_msgs on asistente_consulta_mensajes (consulta_id, created_at);

alter table asistente_consultas enable row level security;
alter table asistente_consulta_mensajes enable row level security;
