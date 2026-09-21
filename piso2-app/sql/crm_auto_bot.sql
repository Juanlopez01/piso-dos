-- ============================================================================
-- CRM · clasificación automática cuando el BOT atiende una charla sin derivar.
--
-- El webhook del asistente ahora, cuando el bot contesta solo (no deriva a un
-- humano), mantiene vivo el lead en crm_leads y lo clasifica con IA
-- (producto/estilo/profe) sin que recep tenga que abrir nada.
--
--   auto_resumen_at : última vez que la IA clasificó este lead automáticamente.
--                     Sirve de throttle: no volvemos a llamar a la IA hasta que
--                     pase la ventana (no gastar en cada mensaje del chat).
--   clasificado_auto: TRUE si la última carga de producto/estilo/profe la hizo la
--                     IA sola. Recep la puede corregir; al corregir queda FALSE.
--
-- Correr una vez en el SQL Editor de Supabase ANTES de desplegar el código.
-- ============================================================================
alter table public.crm_leads add column if not exists auto_resumen_at timestamptz;
alter table public.crm_leads add column if not exists clasificado_auto boolean not null default false;
