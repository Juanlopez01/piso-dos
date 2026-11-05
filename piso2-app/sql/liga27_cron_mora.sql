-- ============================================================================
-- La Liga 2027 — programar el bloqueo por mora con pg_cron.
-- La función public.liga27_bloquear_morosos() ya existe (migración fase1).
-- Bloquea las inscripciones con la CUOTA del mes vigente impaga; se desbloquean
-- al registrar el pago. Como las cuotas arrancan en enero 2027, antes de eso no
-- bloquea a nadie (no hay cuotas vencidas): dejarlo agendado desde ya es inocuo.
--
-- Corre todos los días 10 a las 9:00 (hora del server). Requiere pg_cron.
-- Idempotente: desagenda el job si ya existía y lo vuelve a agendar.
-- ============================================================================
select cron.unschedule('liga27_bloqueo_mora')
  where exists (select 1 from cron.job where jobname = 'liga27_bloqueo_mora');

select cron.schedule('liga27_bloqueo_mora', '0 9 10 * *', $$ select public.liga27_bloquear_morosos(); $$);
