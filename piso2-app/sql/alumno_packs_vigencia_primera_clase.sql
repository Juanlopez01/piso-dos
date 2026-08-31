-- ============================================================================
-- Vigencia de packs desde la PRIMERA CLASE usada (no desde la compra).
-- Regla nueva (en la app, inscripciones.ts): al usar la 1ª clase del pack, se
-- setea fecha_vencimiento = min(fecha_compra + 60 días, primera_clase + 30 días).
-- Mientras no lo usen, el pack vive hasta el tope de 60 días desde la compra.
-- Esta columna sólo marca si la vigencia ya arrancó (para no re-anclar).
-- Aplica de acá en adelante; los packs viejos quedan como están.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.alumno_packs
    add column if not exists fecha_primera_asistencia timestamptz;
