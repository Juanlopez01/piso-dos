-- ============================================================================
-- PISO2E · Ticketera (Fase 1 interna). Muestras/shows del estudio: eventos con
-- tipos de entrada (precio + cupo) y registro de ventas desde recepción.
-- Sin checkout público todavía. Solo service-role (RLS on, sin policies).
-- ============================================================================

create table if not exists eventos (
    id           uuid primary key default gen_random_uuid(),
    nombre       text not null,
    descripcion  text,
    fecha        timestamptz,                                   -- fecha/hora de la función
    lugar        text,                                          -- sede / dirección (texto libre)
    estado       text not null default 'borrador'
                 check (estado in ('borrador', 'activo', 'finalizado')),
    created_at   timestamptz not null default now(),
    created_by   uuid references profiles(id)
);
create index if not exists idx_eventos_estado on eventos (estado, fecha);

-- Tipos de entrada por evento (General, VIP, Platea, Menor…)
create table if not exists evento_entradas (
    id           uuid primary key default gen_random_uuid(),
    evento_id    uuid not null references eventos(id) on delete cascade,
    nombre       text not null,
    precio       numeric not null default 0,
    cupo         integer not null default 0,                    -- capacidad total de este tipo
    orden        integer not null default 0,
    activo       boolean not null default true,
    created_at   timestamptz not null default now()
);
create index if not exists idx_evento_entradas on evento_entradas (evento_id, orden);

-- Ventas (registradas por recepción)
create table if not exists evento_ventas (
    id                 uuid primary key default gen_random_uuid(),
    evento_id          uuid not null references eventos(id) on delete cascade,
    comprador_nombre   text,
    comprador_contacto text,
    medio_pago         text not null default 'efectivo',        -- efectivo/transferencia/mercadopago
    total              numeric not null default 0,
    estado             text not null default 'confirmada'
                       check (estado in ('confirmada', 'anulada')),
    vendido_por        uuid references profiles(id),
    created_at         timestamptz not null default now()
);
create index if not exists idx_evento_ventas on evento_ventas (evento_id, estado, created_at desc);

-- Ítems de cada venta (qué tipos de entrada y cuántas)
create table if not exists evento_venta_items (
    id           uuid primary key default gen_random_uuid(),
    venta_id     uuid not null references evento_ventas(id) on delete cascade,
    entrada_id   uuid not null references evento_entradas(id),
    cantidad     integer not null default 1,
    precio_unit  numeric not null default 0
);
create index if not exists idx_evento_venta_items on evento_venta_items (venta_id);
create index if not exists idx_evento_venta_items_entrada on evento_venta_items (entrada_id);

alter table eventos            enable row level security;
alter table evento_entradas    enable row level security;
alter table evento_ventas      enable row level security;
alter table evento_venta_items enable row level security;
