-- ============================================================================
-- Vínculo contacto de ManyChat (IG/WhatsApp) → perfil de alumno.
--
-- El contacto no trae un id de alumno; recep lo vincula una vez (o lo detecta
-- el sistema por nombre/teléfono) y queda guardado, así la próxima vez la ficha
-- del alumno (créditos, deudas, próximas clases) aparece sola en el chat.
-- ============================================================================

create table if not exists asistente_contacto_perfil (
    subscriber_id text primary key,
    canal         text,
    perfil_id     uuid references profiles(id) on delete cascade,
    vinculado_por uuid references profiles(id) on delete set null,
    created_at    timestamptz default now()
);

create index if not exists idx_asist_contacto_perfil_perfil on asistente_contacto_perfil (perfil_id);
