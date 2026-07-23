-- ============================================================================
-- "Visible para vendedores": el admin elige, producto por producto, cuáles
-- puede ofrecer el vendedor externo (ej. las clases sueltas NO se venden así).
-- Separado de visible_tienda (lo que ven los alumnos en la Tienda).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.productos
    add column if not exists visible_vendedor boolean not null default false;

-- Backfill: dejamos habilitado lo que el vendedor SÍ vende, el resto queda en
-- 'no' (incluidas las clases sueltas). El admin ajusta el resto desde Productos.

-- 1) Cuponeras / packs (más de 1 clase). Las clases sueltas (creditos = 1) quedan fuera.
update public.productos
set visible_vendedor = true
where activo = true
  and tipo_clase in ('regular', 'seminario')
  and coalesce(creditos, 0) > 1;

-- 2) Productos de servicio del módulo (los seedeados para ventas externas).
update public.productos
set visible_vendedor = true
where nombre in (
    'Compañía - Cuota', 'Workshop',
    'Alquiler Sala Stream', 'Alquiler Sala Negra', 'Alquiler Sala Blanca',
    'Producción', 'Evento', 'Otro'
);
