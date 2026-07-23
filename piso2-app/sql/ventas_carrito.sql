-- ============================================================================
-- Carrito: una venta puede tener varios productos (ítems). La venta guarda los
-- totales (monto + comisión) y el detalle vive en ventas_items.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists public.ventas_items (
    id              uuid primary key default gen_random_uuid(),
    venta_id        uuid not null references public.ventas_externas(id) on delete cascade,
    producto_id     uuid not null references public.productos(id),
    producto_nombre text not null,
    categoria       text,
    cantidad        int not null default 1 check (cantidad >= 1),
    precio_unitario numeric not null,
    subtotal        numeric not null,
    -- Comisión congelada por ítem
    comision_tipo   text not null default 'porcentaje',
    comision_pct    numeric not null default 0,
    comision_monto  numeric not null default 0
);

create index if not exists idx_ventas_items_venta on public.ventas_items(venta_id);

alter table public.ventas_items enable row level security;

-- Backfill: cada venta existente pasa a ser un carrito de 1 ítem, así el nuevo
-- flujo (entrega y pago por ítems) funciona también para las que ya estaban.
insert into public.ventas_items
    (venta_id, producto_id, producto_nombre, categoria, cantidad, precio_unitario, subtotal, comision_tipo, comision_pct, comision_monto)
select v.id, v.producto_id, v.producto_nombre, v.categoria, v.cantidad, v.precio_unitario, v.monto_total,
       coalesce(v.comision_tipo, 'porcentaje'), coalesce(v.comision_pct, 0), coalesce(v.comision_monto, 0)
from public.ventas_externas v
where not exists (select 1 from public.ventas_items i where i.venta_id = v.id);
