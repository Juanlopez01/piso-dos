-- ============================================================================
-- LINKS DE PAGO — El vendedor genera un link oficial y lo manda por WhatsApp.
-- Correr una vez en el SQL Editor de Supabase.
--
-- Diseño: el link SIEMPRE apunta a un producto del catálogo. El precio y el
-- descuento se calculan y se congelan en el server al crear el link, así el
-- monto no se puede tocar desde el navegador.
-- ============================================================================

-- 1. ROL 'vendedor'
--    Si 'rol' es un enum de Postgres lo extendemos; si es text, no hace nada.
do $$
begin
    if exists (select 1 from pg_type where typname = 'user_role') then
        alter type public.user_role add value if not exists 'vendedor';
    end if;
end $$;

-- 2. TECHO DE DESCUENTO (en %). El server nunca deja pasar más que esto.
--    Cambiá el 20 por lo que quieras; se edita desde acá o desde configuraciones.
insert into public.configuraciones (clave, valor)
values ('vendedor_descuento_max', '20')
on conflict (clave) do nothing;

-- 3. LINKS DE PAGO
create table if not exists public.links_pago (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    vendedor_id  uuid not null references public.profiles(id),
    producto_id  uuid not null references public.productos(id),

    -- Snapshot de precio al momento de crear el link. Si mañana cambia el
    -- precio del producto, el link ya emitido respeta lo que se le prometió
    -- al cliente.
    precio_base   numeric not null,
    descuento_pct numeric not null default 0,
    monto_final   numeric not null,

    -- A quién se le vende (prospecto, puede no tener cuenta todavía)
    cliente_nombre   text not null,
    cliente_whatsapp text not null,
    cliente_email    text,
    user_id          uuid references public.profiles(id), -- se completa al identificarse

    estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'pagado', 'anulado', 'expirado')),
    mp_payment_id text,
    pagado_at     timestamptz,
    expira_at     timestamptz not null default (now() + interval '7 days')
);

create index if not exists idx_links_pago_vendedor on public.links_pago(vendedor_id);
create index if not exists idx_links_pago_estado on public.links_pago(estado);

-- Un pago de MP no puede marcar dos links distintos.
create unique index if not exists idx_links_pago_mp_payment
    on public.links_pago(mp_payment_id) where mp_payment_id is not null;

-- 4. RLS: mismo criterio que talentos — nadie toca la tabla directo desde el
--    navegador. Todo pasa por server actions con service role.
alter table public.links_pago enable row level security;
