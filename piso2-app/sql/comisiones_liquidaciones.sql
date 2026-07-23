-- ============================================================================
-- Comisiones: tipo (% o monto fijo) + liquidaciones de vendedores por período
-- (de liquidación a liquidación, no por mes calendario).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- 1. PRODUCTOS: la comisión puede ser porcentaje o un monto fijo por unidad.
alter table public.productos
    add column if not exists comision_tipo text not null default 'porcentaje'
        check (comision_tipo in ('porcentaje', 'monto_fijo')),
    add column if not exists comision_monto numeric not null default 0;

-- 2. VENTAS: snapshot del tipo + a qué liquidación quedó asociada la comisión.
alter table public.ventas_externas
    add column if not exists comision_tipo text not null default 'porcentaje',
    add column if not exists liquidacion_id uuid;

create index if not exists idx_ventas_ext_liquidacion
    on public.ventas_externas(vendedor_id, estado, liquidacion_id);

-- 3. LIQUIDACIONES DE VENDEDOR: cada cierre de comisiones.
--    El "período" es todo lo pagado y NO liquidado hasta ese momento; al cerrar,
--    esas ventas quedan atadas a esta liquidación y arranca un período nuevo.
create table if not exists public.vendedor_liquidaciones (
    id             uuid primary key default gen_random_uuid(),
    created_at     timestamptz not null default now(),
    vendedor_id    uuid not null references public.profiles(id),
    liquidado_por  uuid references public.profiles(id),
    total_comision numeric not null default 0,
    cantidad_ventas int not null default 0,
    desde          timestamptz,   -- fecha de la primera venta incluida
    hasta          timestamptz    -- fecha de la última venta incluida
);

create index if not exists idx_vend_liq_vendedor on public.vendedor_liquidaciones(vendedor_id);

alter table public.vendedor_liquidaciones enable row level security;
