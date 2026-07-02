-- ============================================================================
-- CUOTA DE LIGA POR MES — override del precio para un mes puntual
-- (ej: meses cortos como julio, o cambios cada 2 meses).
-- Si NO hay fila para el mes/nivel, se usa el precio global de 'configuraciones'.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists public.liga_cuotas (
    anio           int not null,
    mes            int not null,
    nivel          int not null,
    precio_transf  numeric not null default 0,
    precio_efvo    numeric not null default 0,
    updated_at     timestamptz not null default now(),
    primary key (anio, mes, nivel)
);

-- Lectura pública (los precios no son sensibles; igual que 'configuraciones').
-- Las escrituras van por server action con service role + chequeo de rol.
alter table public.liga_cuotas enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'liga_cuotas_read') then
        create policy "liga_cuotas_read" on public.liga_cuotas for select using (true);
    end if;
end $$;
