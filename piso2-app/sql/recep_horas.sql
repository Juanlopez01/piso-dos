-- ============================================================================
-- AJUSTE MANUAL de horas de recepción por mes.
-- Si existe fila para (anio, mes, recep), se usa ese total en vez del calculado
-- por los turnos. Permite corregir sin editar turno por turno.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists public.recep_horas_ajuste (
    anio        int not null,
    mes         int not null,
    recep_id    uuid not null,
    horas       numeric not null default 0,
    updated_at  timestamptz not null default now(),
    primary key (anio, mes, recep_id)
);

alter table public.recep_horas_ajuste enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'recep_horas_read') then
        create policy "recep_horas_read" on public.recep_horas_ajuste for select using (true);
    end if;
end $$;
