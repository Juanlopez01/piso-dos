-- ============================================================================
-- Vigencia de créditos (30 días): mantiene el CONTADOR del perfil sincronizado
-- con los packs válidos. El problema era que al vencer un pack se marcaba
-- vencido PERO no se descontaba `profiles.creditos_regulares/especiales`, que
-- es lo que ve la recepción al inscribir → quedaban créditos "fantasma".
--
-- Esta función:
--   1) marca como 'vencido' (y pone créditos en 0) los packs activos vencidos;
--   2) recalcula el contador del perfil = suma de créditos de packs VÁLIDOS
--      (activos, con crédito). Los exclusivos NO cuentan acá (van por pases).
-- Es idempotente: se puede correr las veces que sea.
-- ============================================================================
create or replace function resync_creditos_vencidos() returns void as $$
begin
    -- 1. Vencer packs activos pasados de fecha
    update alumno_packs
       set estado = 'vencido', creditos_restantes = 0
     where estado = 'activo'
       and fecha_vencimiento < now()
       and creditos_restantes > 0;

    -- 2. Recalcular contador del perfil desde los packs válidos
    update profiles p set
        creditos_regulares = coalesce((
            select sum(a.creditos_restantes) from alumno_packs a
             where a.user_id = p.id and a.estado = 'activo' and a.creditos_restantes > 0
               and coalesce(a.tipo_clase, 'regular') = 'regular'), 0),
        creditos_especiales = coalesce((
            select sum(a.creditos_restantes) from alumno_packs a
             where a.user_id = p.id and a.estado = 'activo' and a.creditos_restantes > 0
               and a.tipo_clase = 'seminario'), 0)
    where p.creditos_regulares > 0
       or p.creditos_especiales > 0
       or exists (select 1 from alumno_packs a
                   where a.user_id = p.id and a.estado = 'activo' and a.creditos_restantes > 0);
end;
$$ language plpgsql security definer;

-- ============================================================================
-- Programación diaria (requiere la extensión pg_cron habilitada en Supabase:
-- Database → Extensions → pg_cron). Corre 06:00 UTC = 03:00 ART.
-- Si ya existía un job con ese nombre, primero: select cron.unschedule('resync-creditos-vencidos');
-- ============================================================================
-- select cron.schedule('resync-creditos-vencidos', '0 6 * * *', $$ select resync_creditos_vencidos(); $$);
