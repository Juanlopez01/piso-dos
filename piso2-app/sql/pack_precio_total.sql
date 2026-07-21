-- ============================================================================
-- Valor por clase FIJO en packs/pases pagados en cuotas.
--
-- Antes: el valor de cada clase salía de monto_abonado / créditos. Como el
-- alumno paga en cuotas (seña + saldo), monto_abonado cambia y cada clase de
-- la semana sumaba distinto.
--
-- Ahora guardamos el precio TOTAL pactado del pack (monto + saldo pendiente al
-- momento de la venta) y el valor por clase se calcula siempre sobre ese total.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.alumno_packs
    add column if not exists precio_total numeric;

-- Backfill de packs ya existentes:
-- 1) pases EXCLUSIVOS con créditos por usar (pretemporada, etc.) → precio del
--    catálogo, que es el total real. Así la semana en curso queda pareja.
update public.alumno_packs ap
set precio_total = p.precio
from public.productos p
where ap.producto_id = p.id
  and ap.precio_total is null
  and ap.tipo_clase = 'exclusivo'
  and ap.creditos_restantes > 0
  and p.precio > 0;

-- 2) el resto → lo abonado (para packs ya cerrados/pagados es el total real).
update public.alumno_packs
set precio_total = coalesce(monto_abonado, 0)
where precio_total is null;

-- ----------------------------------------------------------------------------
-- RETROACTIVO: re-alinea las clases YA marcadas de pases exclusivos ACTIVOS
-- (pretemporada en curso) al valor fijo precio_total ÷ créditos, para que los
-- días ya cargados queden parejos con los que falten. No toca packs cerrados.
-- ----------------------------------------------------------------------------
update public.inscripciones i
set valor_credito = round(ap.precio_total / ap.cantidad_inicial)
from public.alumno_packs ap
where i.pack_usado_id = ap.id
  and ap.tipo_clase = 'exclusivo'
  and ap.creditos_restantes > 0
  and ap.cantidad_inicial > 0
  and ap.precio_total is not null;
