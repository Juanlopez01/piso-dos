-- ============================================================================
-- LIBRO DE ADMINISTRACIÓN (privado: solo Nico y Santi)
-- ============================================================================
-- Flag de acceso: lo activa el admin desde /usuarios a quien corresponda.
-- No es por rol (no todos los admin lo ven), es por usuario puntual.
alter table profiles add column if not exists admin_finanzas boolean not null default false;

-- Movimientos manuales del libro (ingresos/egresos que cargan Nico/Santi a mano).
-- OJO: las cajas (Obelisco/Congreso) NO se guardan acá; se calculan solas
-- desde caja_movimientos y se muestran como líneas automáticas por sede/día.
-- metodo: efectivo | transferencia | dolares  ·  tipo: ingreso | egreso
create table if not exists admin_movimientos (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  concepto   text not null,
  tipo       text not null check (tipo in ('ingreso','egreso')),
  metodo     text not null check (metodo in ('efectivo','transferencia','dolares')),
  monto      numeric not null check (monto >= 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_mov_fecha on admin_movimientos(fecha);

-- RLS: defensa en profundidad. Las server actions ya validan admin_finanzas,
-- pero igual restringimos la tabla a usuarios con el flag.
alter table admin_movimientos enable row level security;
drop policy if exists admin_mov_finanzas on admin_movimientos;
create policy admin_mov_finanzas on admin_movimientos
  for all
  using      (exists (select 1 from profiles p where p.id = auth.uid() and p.admin_finanzas = true))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.admin_finanzas = true));

-- Corrección manual de las líneas automáticas de caja (por día y sede).
-- Si existe, reemplaza lo calculado desde caja_movimientos para ese día/sede.
-- sede_key = id de la sede, o 'pozo' para los egresos de administración (turno_id null).
create table if not exists admin_caja_override (
  anio       int not null,
  mes        int not null,
  dia        int not null,
  sede_key   text not null,
  ef_ing     numeric not null default 0,
  ef_egr     numeric not null default 0,
  tr_ing     numeric not null default 0,
  tr_egr     numeric not null default 0,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  primary key (anio, mes, dia, sede_key)
);
alter table admin_caja_override enable row level security;
drop policy if exists admin_caja_ov_finanzas on admin_caja_override;
create policy admin_caja_ov_finanzas on admin_caja_override
  for all
  using      (exists (select 1 from profiles p where p.id = auth.uid() and p.admin_finanzas = true))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.admin_finanzas = true));
