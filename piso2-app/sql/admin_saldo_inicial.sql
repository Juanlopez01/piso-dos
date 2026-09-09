-- Saldo inicial por mes del Libro de Administración (cierre mensual, carga a mano).
-- El saldo final del mes = este saldo inicial + los movimientos del mes.
create table if not exists admin_saldo_inicial (
  anio       int not null,
  mes        int not null,
  pesos      numeric not null default 0,
  dolares    numeric not null default 0,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  primary key (anio, mes)
);
alter table admin_saldo_inicial enable row level security;
