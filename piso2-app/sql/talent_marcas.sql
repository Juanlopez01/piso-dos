-- ============================================================================
-- MARCAS que acompañan (logos) para la home de Piso2 Talent.
-- Usa el mismo bucket 'talent' (subcarpeta marcas/). Correr una vez.
-- ============================================================================

create table if not exists public.talent_marcas (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    nombre      text not null,
    logo_url    text not null,
    orden       int not null default 0,
    activo      boolean not null default true
);

alter table public.talent_marcas enable row level security;
-- Lectura/escritura solo por server action con service role (no hace falta policy).
