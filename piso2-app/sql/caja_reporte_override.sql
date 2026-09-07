-- ============================================================================
-- Reporte mensual de caja EDITABLE.
-- El reporte se calcula solo de caja_movimientos (ingreso/egreso × efectivo/
-- transferencia, por día). Esta tabla guarda correcciones manuales por celda:
-- si hay override para (anio, mes, dia, tipo, metodo), ese valor MANDA sobre el
-- calculado (planilla editable, "lo del sistema/lo cargado es lo válido").
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
create table if not exists public.caja_reporte_override (
    anio       int  not null,
    mes        int  not null,
    dia        int  not null,
    tipo       text not null check (tipo in ('ingreso', 'egreso')),
    metodo     text not null check (metodo in ('efectivo', 'transferencia')),
    monto      numeric not null default 0,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    primary key (anio, mes, dia, tipo, metodo)
);

alter table public.caja_reporte_override enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'caja_reporte_override_read') then
        create policy "caja_reporte_override_read" on public.caja_reporte_override for select using (true);
    end if;
end $$;
