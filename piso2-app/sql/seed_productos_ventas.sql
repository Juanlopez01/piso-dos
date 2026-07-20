-- ============================================================================
-- SEED de productos para el módulo de Ventas Externas (lista del admin).
-- Idempotente: no duplica si el producto ya existe (por nombre).
--
-- Los servicios de precio variable (Alquileres, Eventos, etc.) quedan ACTIVOS
-- con precio 0 y "precio editable" = sí: el vendedor tipea el importe acordado
-- en cada venta. La Liga queda INACTIVA hasta que el admin le ponga precio.
-- Ninguno es visible en la Tienda pública.
-- ============================================================================

insert into public.productos
    (nombre, descripcion, precio, creditos, activo, tipo_clase, categoria, visible_tienda, permite_editar_precio, comision_pct, entrega_tipo)
select v.* from (values
    -- nombre                | desc | precio | cred | activo | tipo_clase | categoria             | vis_tienda | edita_precio | comision | entrega
    ('Compañía - Cuota',      '',     0,       1,     true,    'regular',   'Compañía',            false,       true,          0,         'ninguna'),
    ('Workshop',              '',     0,       1,     true,    'regular',   'Workshops',           false,       true,          0,         'ninguna'),
    ('Alquiler Sala Stream',  '',     0,       1,     true,    'regular',   'Alquiler Sala Stream',false,       true,          0,         'ninguna'),
    ('Alquiler Sala Negra',   '',     0,       1,     true,    'regular',   'Alquiler Sala Negra', false,       true,          0,         'ninguna'),
    ('Alquiler Sala Blanca',  '',     0,       1,     true,    'regular',   'Alquiler Sala Blanca',false,       true,          0,         'ninguna'),
    ('Producción',            '',     0,       1,     true,    'regular',   'Producciones',        false,       true,          0,         'ninguna'),
    ('Evento',                '',     0,       1,     true,    'regular',   'Eventos',             false,       true,          0,         'ninguna'),
    ('Otro',                  '',     0,       1,     true,    'regular',   'Otros',               false,       true,          0,         'ninguna'),
    ('La Liga - Cuota',       '',     0,       1,     false,   'regular',   'La Liga',             false,       false,         0,         'cuota_liga')
) as v(nombre, descripcion, precio, creditos, activo, tipo_clase, categoria, visible_tienda, permite_editar_precio, comision_pct, entrega_tipo)
where not exists (
    select 1 from public.productos p where p.nombre = v.nombre
);
