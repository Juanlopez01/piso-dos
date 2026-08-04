-- Vincula un producto de cuota con su compañía, para que al pagarse por venta
-- externa el webhook registre el pago en companias_pagos (impacta en la
-- liquidación de la compañía). Antes las cuotas de compañía por link de pago
-- no impactaban en el grupo.
alter table productos add column if not exists compania_id uuid references companias(id);
