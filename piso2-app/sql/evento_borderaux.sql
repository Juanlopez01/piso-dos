-- ============================================================================
-- PISO2E · Borderaux / liquidación de la función.
-- Cruza ingresos (ventas) menos deducciones (equipo + servicios/gastos) y
-- reparte el neto entre la compañía y Piso 2 según un % configurable.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- % que le corresponde a la compañía sobre el neto, y si el equipo de función
-- se descuenta antes del reparto. Configurables por función.
alter table public.eventos
    add column if not exists reparto_compania_pct     numeric not null default 70,
    add column if not exists borderaux_incluir_equipo boolean not null default true;

-- Deducciones cargadas a mano (servicios de Piso 2, gastos varios de la función).
create table if not exists public.evento_gastos (
    id          uuid primary key default gen_random_uuid(),
    evento_id   uuid not null references public.eventos(id) on delete cascade,
    concepto    text not null,
    monto       numeric not null default 0,
    created_at  timestamptz not null default now(),
    created_by  uuid
);

create index if not exists idx_evento_gastos_evento on public.evento_gastos(evento_id);
