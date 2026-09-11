-- Cupo opcional de un producto (para clases especiales que se venden por la Tienda).
-- NULL = sin límite (como hasta ahora). Si tiene número, la compra POR CUENTA PROPIA
-- (Tienda / online) se corta al llegar al tope. La carga a mano de la recep NO se frena.
alter table productos add column if not exists cupo int;
