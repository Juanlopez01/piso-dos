-- ============================================================================
-- Obras <-> Funciones: pasa de "una obra en una función" a MUCHAS-A-MUCHAS.
-- Una misma compañía/obra puede estar en varias funciones (ej. ASONADA el 7 y
-- el 13) y una función puede tener varias obras. El listado ya no "consume" la
-- obra al usarla. La atribución por link (?cia=obra) y el reporte no cambian.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
create table if not exists public.evento_obras (
    evento_id uuid not null references public.eventos(id) on delete cascade,
    obra_id uuid not null references public.obra_propuestas(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (evento_id, obra_id)
);

-- Migramos los vínculos que ya existían (obra_propuestas.evento_id).
insert into public.evento_obras (evento_id, obra_id)
select evento_id, id from public.obra_propuestas where evento_id is not null
on conflict do nothing;

create index if not exists idx_evento_obras_obra on public.evento_obras (obra_id);
-- (La columna obra_propuestas.evento_id queda como legado; ya no se usa.)
