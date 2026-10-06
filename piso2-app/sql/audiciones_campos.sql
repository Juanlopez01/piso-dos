-- ============================================================================
-- Piso 2 On Tour — campos nuevos del participante:
--   · altura (texto libre, ej "1.70")
--   · checkboxes de aptitudes: manejo de tacos, jazz/heels, técnica, urbano/comercial
-- La "anotación por persona" usa la columna notas, que ya existe.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.audicion_participantes add column if not exists altura text;
alter table public.audicion_participantes add column if not exists manejo_tacos boolean not null default false;
alter table public.audicion_participantes add column if not exists sabe_jazz_heels boolean not null default false;
alter table public.audicion_participantes add column if not exists sabe_tecnica boolean not null default false;
alter table public.audicion_participantes add column if not exists sabe_urbano boolean not null default false;
