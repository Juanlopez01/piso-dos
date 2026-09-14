-- ============================================================================
-- Vínculo producto especial → clase, para auto-inscribir al comprar el pack.
--
-- Cuando un producto (clase especial, ej: Manzano) tiene clase_id seteada,
-- al comprar el pack el alumno queda inscripto automáticamente a esa clase
-- (y a las demás clases de su serie dentro del mismo mes), SIEMPRE Y CUANDO
-- la cantidad de créditos del pack sea igual a la cantidad de clases objetivo.
-- ============================================================================

alter table productos
    add column if not exists clase_id uuid references clases(id) on delete set null;

comment on column productos.clase_id is
    'Clase especial vinculada. Al comprar el pack se auto-inscribe a esta clase (y a su serie del mes) si creditos == cantidad de clases.';
