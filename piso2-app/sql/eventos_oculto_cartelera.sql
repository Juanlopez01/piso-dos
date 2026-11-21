-- Permite ocultar un evento de la cartelera pública sin desactivar la venta online.
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS oculto_cartelera boolean NOT NULL DEFAULT false;
