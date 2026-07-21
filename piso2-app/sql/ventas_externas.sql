-- ============================================================================
-- MÓDULO DE VENTAS EXTERNAS — Vendedores externos cobran por link de MP.
-- Correr una vez en el SQL Editor de Supabase.
--
-- Reemplaza al viejo sql/links_pago.sql (que NO llegó a correrse). Acá está
-- todo el módulo: rol, productos configurables, ventas y comisiones.
-- ============================================================================

-- 1. ROL 'vendedor'
--    El enum de rol en esta base se llama 'rol_usuario'. Este ALTER va SUELTO
--    (no dentro de un bloque/transacción). Si el editor se queja de "transaction
--    block", ejecutá solo esta línea primero y después el resto del archivo.
alter type public.rol_usuario add value if not exists 'vendedor';

-- La tabla profiles tiene un CHECK 'roles_permitidos' (aparte del enum) que
-- limita los valores de rol. Lo recreamos para que acepte 'vendedor'.
alter table public.profiles drop constraint if exists roles_permitidos;
alter table public.profiles add constraint roles_permitidos
    check (rol in (
        'admin', 'recepcion', 'profesor', 'alumno',
        'coordinador', 'auxiliar', 'visitante', 'vendedor'
    ));

-- Estado Activo/Inactivo del vendedor (spec punto 1)
alter table public.profiles
    add column if not exists vendedor_activo boolean not null default true;

-- 2. PRODUCTOS: los volvemos configurables para el módulo (spec punto 8).
--    Los productos que ya existen son packs de créditos → defaults que no
--    cambian su comportamiento actual (siguen en la Tienda, siguen acreditando).
alter table public.productos
    add column if not exists categoria text not null default 'Otros',
    add column if not exists visible_tienda boolean not null default true,
    add column if not exists permite_editar_precio boolean not null default false,
    add column if not exists comision_pct numeric not null default 0,
    -- Qué entrega el sistema cuando se aprueba el pago:
    --   creditos       → carga créditos (packs de clase, lógica actual)
    --   cuota_liga     → marca la cuota de La Liga del mes
    --   cuota_compania → marca la cuota de un Grupo del mes
    --   ninguna        → solo registra la venta (Alquileres, Eventos, Producciones)
    add column if not exists entrega_tipo text not null default 'creditos'
        check (entrega_tipo in ('creditos', 'cuota_liga', 'cuota_compania', 'ninguna'));

-- 3. VENTAS EXTERNAS
create table if not exists public.ventas_externas (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    vendedor_id  uuid not null references public.profiles(id),
    producto_id  uuid not null references public.productos(id),

    -- Snapshots al momento de la venta (si mañana cambia el catálogo, la venta
    -- ya emitida respeta lo que se le prometió/cobró al cliente)
    producto_nombre text not null,
    categoria       text not null default 'Otros',
    cantidad        int not null default 1 check (cantidad >= 1),
    precio_unitario numeric not null,
    monto_total     numeric not null,

    -- Comisión congelada a la fecha de la venta (spec punto 7 / comisiones)
    comision_pct   numeric not null default 0,
    comision_monto numeric not null default 0,

    -- Comprador (prospecto, puede no tener cuenta)
    comprador_nombre    text not null,
    comprador_telefono  text not null,
    comprador_email     text,
    observaciones       text,
    user_id             uuid references public.profiles(id), -- cuenta del comprador, si se crea

    estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'pagado', 'cancelado', 'vencido')),
    mp_payment_id text,
    pagado_at     timestamptz,
    expira_at     timestamptz not null default (now() + interval '7 days')
);

create index if not exists idx_ventas_ext_vendedor on public.ventas_externas(vendedor_id);
create index if not exists idx_ventas_ext_estado   on public.ventas_externas(estado);
create index if not exists idx_ventas_ext_fecha    on public.ventas_externas(created_at);

-- Un pago de MP no puede marcar dos ventas distintas (idempotencia).
create unique index if not exists idx_ventas_ext_mp_payment
    on public.ventas_externas(mp_payment_id) where mp_payment_id is not null;

-- 4. RLS: nadie toca la tabla directo desde el navegador. Todo pasa por server
--    actions con service role, que ya validan rol y ownership.
alter table public.ventas_externas enable row level security;

-- 5. Marca vencidas las ventas pendientes que pasaron su expiración.
--    La llama una server action al abrir el panel (no necesita cron).
create or replace function public.marcar_ventas_vencidas()
returns void language sql as $$
    update public.ventas_externas
    set estado = 'vencido'
    where estado = 'pendiente' and expira_at < now();
$$;
