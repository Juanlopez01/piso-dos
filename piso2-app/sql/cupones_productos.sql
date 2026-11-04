-- Cupones restringibles a productos específicos.
-- Si producto_ids está vacío ({}), el cupón aplica a TODOS los productos (comportamiento actual).
-- Si tiene ids, el cupón solo es válido para esos productos.
alter table public.cupones
    add column if not exists producto_ids uuid[] not null default '{}';

comment on column public.cupones.producto_ids is
    'Productos a los que aplica el cupón. Vacío = aplica a todos.';
