-- ============================================================================
-- Auto-cierre de turnos de caja ABANDONADOS (dejados abiertos).
-- Cierra los turnos 'abierta' con más de 12 hs desde la apertura (un turno normal
-- se cierra el mismo día), poniéndoles cierre = apertura + 12 hs. Esto evita que
-- queden abiertos para siempre y topea las horas. El admin puede editar el cierre
-- al horario real desde Liquidaciones.
-- Correr una vez en el SQL Editor de Supabase (pg_cron ya está habilitado).
-- ============================================================================

create or replace function public.autocerrar_turnos_caja()
returns integer
language plpgsql
security definer
as $$
declare n integer;
begin
    update public.caja_turnos
        set fecha_cierre = fecha_apertura + interval '12 hours',
            estado = 'cerrada',
            cerrado_at = now(),
            notas_cierre = coalesce(notas_cierre, '') || ' [auto-cierre: turno abandonado >12h]'
    where estado = 'abierta'
      and fecha_apertura < now() - interval '12 hours';
    get diagnostics n = row_count;
    return n;
end $$;

-- Programar cada hora (idempotente: si ya existe, lo reprograma).
do $$
begin
    perform cron.unschedule('autocerrar-turnos-caja');
exception when others then null;
end $$;

select cron.schedule('autocerrar-turnos-caja', '0 * * * *', $$ select public.autocerrar_turnos_caja(); $$);
