-- ============================================================================
-- Eventos: AFORO total + atribución de ventas por COMPAÑÍA (obra del programa).
--   · eventos.aforo        -> cupo total del evento (null = sin tope).
--   · evento_ventas.obra_origen -> si la venta entró por el link de una compañía,
--     guarda la obra/compañía que la refirió. NULL = venta directa (Piso 2).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.eventos add column if not exists aforo integer;
alter table public.evento_ventas add column if not exists obra_origen uuid references public.obra_propuestas(id);
create index if not exists idx_evento_ventas_obra_origen on public.evento_ventas (obra_origen);
