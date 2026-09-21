-- ============================================================================
-- CRM del asistente · embudo de prospectos dentro de Consultas.
--
-- La LISTA de leads se deriva sola de las conversaciones (asistente_historial /
-- asistente_consultas). Esta tabla guarda solo la CAPA editable del CRM por
-- contacto (etapa, producto, estilo, profe, notas). Una fila por contacto.
-- Correr una vez en el SQL Editor de Supabase ANTES de desplegar el código.
-- ============================================================================
create table if not exists public.crm_leads (
    subscriber_id   text primary key,                 -- id del contacto (ManyChat) = 1:1 con el chat
    canal           text,
    nombre          text,
    whatsapp        text,
    instagram       text,
    mail            text,
    perfil_id       uuid references public.profiles(id) on delete set null,
    etapa           text not null default 'nuevo',    -- nuevo/contactado/seguimiento/ganado/perdido/area_artistica/en_verano
    producto        text,
    estilo          text,
    profe           text,
    notas           text,
    ultimo_contacto timestamptz,                       -- se refresca con la actividad del chat
    proximo_contacto date,                             -- opcional: recordatorio manual
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_crm_leads_etapa on public.crm_leads (etapa);
create index if not exists idx_crm_leads_perfil on public.crm_leads (perfil_id);
alter table public.crm_leads enable row level security;
