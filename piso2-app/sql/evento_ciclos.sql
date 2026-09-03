-- ============================================================================
-- PISO2E · Ciclos de varias fechas.
-- Un ciclo agrupa varias FUNCIONES; cada función es un evento hermano (conserva
-- su propio cupo/ventas/QR/check-in/reportes/borderaux). El público entra por el
-- link del ciclo y elige la fecha.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
create table if not exists public.evento_ciclos (
    id          uuid primary key default gen_random_uuid(),
    nombre      text not null,
    descripcion text,
    flyer_url   text,
    slug        text unique not null,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    created_by  uuid
);

alter table public.eventos
    add column if not exists ciclo_id  uuid references public.evento_ciclos(id) on delete set null,
    add column if not exists flyer_url text;

create index if not exists idx_eventos_ciclo on public.eventos(ciclo_id);
