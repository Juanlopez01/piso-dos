-- ============================================================================
-- PISO2E · Curaduría — PAPELERA (borrado blando) de postulaciones.
--
-- Antes el tacho hacía DELETE físico y se perdía el contacto para siempre. Ahora
-- "eliminar" archiva: la postulación sale de las listas pero queda en la base con
-- todos sus datos, y se puede restaurar. El borrado definitivo queda solo para
-- admin desde la papelera.
--
--   archivada_at  : cuándo se mandó a la papelera (null = activa).
--   archivada_por : quién la archivó.
--
-- Correr una vez en el SQL Editor de Supabase ANTES de desplegar el código.
-- ============================================================================
alter table public.obra_propuestas add column if not exists archivada_at  timestamptz;
alter table public.obra_propuestas add column if not exists archivada_por uuid references public.profiles(id);
create index if not exists idx_obra_propuestas_archivada on public.obra_propuestas (archivada_at);
