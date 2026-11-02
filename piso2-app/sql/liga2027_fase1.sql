-- ============================================================================
-- LA LIGA 2027 — FASE 1 (Inscripción + Pagos)
-- Módulo NUEVO, namespaced `liga27_*` para NO colisionar con el módulo La Liga
-- actual (tablas `liga_*`, incl. `liga_pagos` que usa el webhook de MP).
--
-- La cuenta del alumno es propia (email + contraseña), igual que Talent:
-- password_hash scrypt + cookie HMAC (lib/liga27-session.ts). Todo el acceso
-- pasa por server actions con service role → las tablas sensibles tienen RLS
-- activado SIN policy (deny-all a anon/authenticated), igual que talent_perfiles.
--
-- Correr una vez en el SQL Editor de Supabase. Idempotente.
-- ============================================================================

-- ── 1.1 Lanzamientos (landing pública "Inscripciones 2027") ──────────────────
create table if not exists public.liga27_lanzamientos (
    id          uuid primary key default gen_random_uuid(),
    titulo      text not null,
    subtitulo   text,
    video_url   text,
    descripcion text,                                  -- texto largo del programa / etapas
    cta_texto   text not null default 'Inscripciones 2027',
    slug        text not null unique,
    activo      boolean not null default false,
    orden       int not null default 0,
    creado_at   timestamptz not null default now()
);

-- La landing es pública: lectura abierta (no es info sensible). Escrituras por
-- server action con service role + chequeo de rol admin.
alter table public.liga27_lanzamientos enable row level security;
do $$ begin
    if not exists (select 1 from pg_policies where policyname = 'liga27_lanzamientos_read') then
        create policy "liga27_lanzamientos_read" on public.liga27_lanzamientos for select using (true);
    end if;
end $$;

-- ── 1.2 Cuenta del alumno La Liga 2027 (patrón Talent) ───────────────────────
create table if not exists public.liga27_perfiles (
    id            uuid primary key default gen_random_uuid(),
    email         text not null unique,
    password_hash text,                                -- null = postulado sin reclamar la cuenta
    nombre        text not null,
    apellido      text,
    telefono      text,
    instagram     text,
    fecha_nac     date,
    ciudad        text,
    foto_url      text,
    dni           text,
    creado_at     timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
-- Sensible → RLS sin policy (solo service role).
alter table public.liga27_perfiles enable row level security;

-- ── Postulaciones (3 CTAs: llamar / escribir / anotarse) ─────────────────────
create table if not exists public.liga27_postulaciones (
    id             uuid primary key default gen_random_uuid(),
    perfil_id      uuid references public.liga27_perfiles(id) on delete cascade,
    lanzamiento_id uuid references public.liga27_lanzamientos(id) on delete set null,
    nombre         text,
    email          text,
    telefono       text,
    instagram      text,
    fecha_nac      date,
    ciudad         text,
    foto_url       text,
    tipo_contacto  text not null check (tipo_contacto in ('llamar','escribir','anotarse')),
    nota           text,
    estado         text not null default 'pendiente' check (estado in ('pendiente','aprobada','no')),
    creado_at      timestamptz not null default now()
);
create index if not exists idx_liga27_post_estado on public.liga27_postulaciones(estado);
create index if not exists idx_liga27_post_perfil on public.liga27_postulaciones(perfil_id);
alter table public.liga27_postulaciones enable row level security;

-- ── 1.3 Inscripción (estado del alumno en el programa) ───────────────────────
create table if not exists public.liga27_inscripciones (
    id                 uuid primary key default gen_random_uuid(),
    perfil_id          uuid not null references public.liga27_perfiles(id) on delete cascade,
    lanzamiento_id     uuid references public.liga27_lanzamientos(id) on delete set null,
    estado             text not null default 'postulado'
                       check (estado in ('postulado','aprobado','bloqueado','baja')),
    anio_ingreso       int not null default 2027,
    letra_actual       text check (letra_actual in ('A','B','C')),
    promedio_letra     text check (promedio_letra in ('A','B','C')),
    matricula_pagada   boolean not null default false,
    plan               text check (plan in ('mensual','cuatrimestral')),
    bienvenida_enviada boolean not null default false,
    bloqueado_motivo   text,
    creado_at          timestamptz not null default now(),
    unique (perfil_id, lanzamiento_id)
);
create index if not exists idx_liga27_insc_estado on public.liga27_inscripciones(estado);
alter table public.liga27_inscripciones enable row level security;

-- ── 1.4 Pagos (matrícula + cuotas + examen libre) ────────────────────────────
create table if not exists public.liga27_pagos (
    id             uuid primary key default gen_random_uuid(),
    inscripcion_id uuid not null references public.liga27_inscripciones(id) on delete cascade,
    concepto       text not null check (concepto in ('matricula','cuota','examen_libre')),
    mes            int,
    anio           int,
    monto          numeric not null default 0,
    estado         text not null default 'pendiente' check (estado in ('pendiente','pagado','anulado')),
    metodo         text,                               -- efectivo/transferencia/tarjeta/mercadopago
    pagado_at      timestamptz,
    mp_ref         text,
    token          text,                               -- protege el link de pago público (MP)
    creado_at      timestamptz not null default now()
);
create index if not exists idx_liga27_pagos_insc on public.liga27_pagos(inscripcion_id);
create index if not exists idx_liga27_pagos_periodo on public.liga27_pagos(anio, mes, concepto);
alter table public.liga27_pagos enable row level security;

-- Precios configurables (reusa el patrón de 'configuraciones' clave/valor):
--   liga27_matricula, liga27_cuota_mensual, liga27_cuota_cuatrimestral
insert into public.configuraciones (clave, valor)
values ('liga27_matricula', 0), ('liga27_cuota_mensual', 0), ('liga27_cuota_cuatrimestral', 0)
on conflict (clave) do nothing;

-- ── Bloqueo por mora (día 10) ────────────────────────────────────────────────
-- Bloquea a los alumnos 'aprobado' que al día 10 del mes NO tienen la cuota del
-- mes en estado 'pagado'. Se desbloquea al registrar el pago (lo hace el server
-- action de pagos). Idempotente: solo toca los que corresponde.
create or replace function public.liga27_bloquear_morosos()
returns void language plpgsql security definer as $$
declare
    v_mes  int := extract(month from now());
    v_anio int := extract(year  from now());
begin
    update public.liga27_inscripciones i
       set estado = 'bloqueado',
           bloqueado_motivo = 'Cuota ' || v_mes || '/' || v_anio || ' impaga'
     where i.estado = 'aprobado'
       and not exists (
            select 1 from public.liga27_pagos p
             where p.inscripcion_id = i.id
               and p.concepto = 'cuota'
               and p.mes = v_mes and p.anio = v_anio
               and p.estado = 'pagado'
       );
end $$;

-- Programar con pg_cron (Juan lo corre si está disponible): todos los días 10 a
-- las 9:00. Descomentar si pg_cron está habilitado:
-- select cron.schedule('liga27_bloqueo_mora', '0 9 10 * *', $$ select public.liga27_bloquear_morosos(); $$);
