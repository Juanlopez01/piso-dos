-- ============================================================================
-- PISO2E · Equipo de función.
-- El jefe de sala registra quién trabajó en cada función y su cachet.
-- Estos montos son los "gastos de la función" que después alimentan el Borderaux.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
create table if not exists public.evento_equipo (
    id          uuid primary key default gen_random_uuid(),
    evento_id   uuid not null references public.eventos(id) on delete cascade,
    nombre      text not null,
    rol         text,               -- Jefe de sala, Sonido, Iluminación, Boletería, Sala, etc.
    monto       numeric not null default 0,
    notas       text,
    created_at  timestamptz not null default now(),
    created_by  uuid
);

create index if not exists idx_evento_equipo_evento on public.evento_equipo(evento_id);
