-- ============================================================================
-- PISO2E · Varias obras por evento (programa) con ADMIN y FICHA por obra.
--
-- Caso: una función con 3 compañías. El público entiende que va a ver las 3,
-- pero por ventas/administración cada obra tiene su liquidación y su ficha.
-- La admin interna (gastos/equipo que paga Piso 2) sigue siendo GENERAL.
--
-- Correr una vez en el SQL Editor de Supabase ANTES de desplegar el código.
-- ============================================================================

-- 1. Cada tipo de entrada puede pertenecer a una obra del evento. Con esto las
--    ventas quedan atribuidas por obra y se puede liquidar a cada compañía.
--    NULL = entrada general de la función (va a Piso 2 en el reparto).
alter table public.evento_entradas
    add column if not exists obra_id uuid references public.obra_propuestas(id) on delete set null;
create index if not exists idx_evento_entradas_obra on public.evento_entradas(obra_id);

-- 2. Ficha técnica y % de reparto propios por obra.
--    reparto_pct NULL = usa el % general del evento (reparto_compania_pct).
alter table public.obra_propuestas
    add column if not exists ficha_tecnica jsonb,
    add column if not exists reparto_pct   numeric;
