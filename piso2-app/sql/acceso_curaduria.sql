-- Permiso aditivo de Curaduría: le da a un usuario (de cualquier rol, ej. un
-- profesor) el mismo acceso que un "curador" (Curaduría + Eventos solo lectura),
-- SIN cambiarle el rol. Lo activa el admin desde /usuarios.
alter table profiles add column if not exists acceso_curaduria boolean not null default false;
