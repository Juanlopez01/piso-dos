-- ============================================================================
-- PISO2 TALENT — Preselección de búsquedas + liberación de contacto.
-- Los seleccionadores (ej: "las chicas de Latino") marcan con ⭐ a los que
-- preseleccionan en el link de selección; Piso 2 ve esas marcas y, por candidato,
-- "libera el contacto" para que ellas avancen con la parte legal.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.talent_busqueda_postulaciones
    add column if not exists preseleccionado      boolean not null default false,
    add column if not exists preseleccionado_at    timestamptz,
    add column if not exists contacto_liberado     boolean not null default false,
    add column if not exists contacto_liberado_at  timestamptz;

create index if not exists idx_talent_busq_post_presel
    on public.talent_busqueda_postulaciones(busqueda_id, preseleccionado);
