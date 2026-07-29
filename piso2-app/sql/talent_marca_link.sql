-- ============================================================================
-- Talent: las marcas (logos "con quiénes trabajamos") pueden tener un link.
-- Al tocar el logo en la vitrina, lleva a ese link.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.talent_marcas
    add column if not exists link text;
