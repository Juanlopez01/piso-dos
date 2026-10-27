# Alquiler de salas autogestionado

> **Estado:** planificado, sin implementar. Igual que [la-liga-2027](./la-liga-2027.md): esto es
> lo próximo a construir; el doc deja todo organizado para hacerlo rápido cuando se dé la orden.
>
> **Origen:** mensaje de Nico Chávez (26/10/2026) con el ejemplo de `ritmiafusion.com/alquiler-sala`:
> *"Fíjate cómo es la experiencia para que reserven sala. Y además muestra calendario. Da link de
> Mercado Pago y es autogestión. Confirmación por mail e instrucciones cómo abrir."*

---

## 1. Objetivo

Que un cliente externo reserve y **pague una sala solo, sin pasar por recepción**:

1. Entra a la página pública de alquileres.
2. Ve el **calendario / disponibilidad** real de cada sala.
3. Elige sala + día + horario → el sistema le **calcula el precio** desde el tarifario.
4. Paga con **MercadoPago** (autogestión).
5. Recibe **confirmación por mail con las instrucciones de acceso** (cómo abrir / código de puerta).

Hoy ya existe casi toda la infraestructura por detrás (tabla, tarifario, chequeo de choques, panel
interno, pago MP, mails). Lo que falta es **cerrar el flujo público**: que la página pública deje de
ser solo un botón de WhatsApp y se convierta en reserva + pago + acceso automáticos.

---

## 2. Qué YA existe (reutilizar, no reconstruir)

| Pieza | Dónde | Sirve para |
|---|---|---|
| Tabla `alquileres` | — | fecha, hora_inicio, hora_fin, sala_id, cliente_nombre, cliente_contacto, monto_total, monto_pagado, estado_pago (`pendiente`/`seña_pagada`/`pagado`), estado (`pendiente`/`confirmado`/`pagado`), metodo_pago, group_id |
| Tarifario por sala | `salas.*` con sufijos `_manana` / `_noche` / `_finde` por tipo de uso | **cálculo automático del precio** (hs matutinas × precio_manana + hs nocturnas × precio_noche; finde/dom con precio_finde) |
| Chequeo de choques (servidor, autoritativo) | `editarAlquilerFechaHoraAction` en [alquileres.ts](../app/actions/alquileres.ts) | valida contra `clases` **y** otros `alquileres` que no se pise el horario |
| Chequeo de disponibilidad (cliente) + lectura de ocupaciones | [alquilar-sala/page.tsx](<../app/(dashboard)/alquilar-sala/page.tsx>) | ya arma las "ocupaciones del día" (clases + alquileres) y detecta solapamientos; base del calendario público |
| Panel interno de gestión | [alquileres/page.tsx](<../app/(dashboard)/alquileres/page.tsx>) + [alquileres.ts](../app/actions/alquileres.ts) | recepción ve/cobra/edita/borra reservas y edita tarifas; aquí caerán también las reservas online |
| Página pública (marketing) | [alquiler/page.tsx](../app/alquiler/page.tsx) | hoy: 2 sedes + "CONSULTAR DISPONIBILIDAD" que abre WhatsApp. Es el lugar donde enchufar el flujo nuevo |
| Preferencia MP (patrón) | [evento-preference/route.ts](../app/api/mercadopago/evento-preference/route.ts) | crea preferencia desde una orden pendiente, back_urls, `metadata.tipo_pago`, devuelve `init_point`. Se clona para alquiler |
| Webhook MP (dispatch por metadata) | [webhook/route.ts](../app/api/mercadopago/webhook/route.ts) | ya ramifica por `metadata.tipo_pago` (`evento_entrada`, `venta_externa`, `cuota_liga`…). Se agrega una rama `alquiler`. Candado anti-duplicado + notificación in-app ya resueltos |
| Mails Resend | [mail.ts](../lib/mail.ts) (`enviarMail`, patrón `mailEntradaHTML`) | se agrega `mailAlquilerHTML` con fecha, horario, sala y **instrucciones de acceso**. Apagado si faltan envs (no rompe) |
| Página de confirmación (patrón) | [entradas/[ventaId]/page.tsx](<../app/entradas/[ventaId]/page.tsx>) | patrón de "comprobante público por token" para la pantalla de reserva confirmada |
| Caja | `caja_movimientos` (ya lo usa `cobrarAlquilerAction`) | registrar el ingreso del alquiler online |

**Conclusión:** el back-end ya está. El trabajo nuevo es (a) el **flujo público de reserva+pago**,
(b) el **precio automático** desde el tarifario (hoy el precio se negocia por WhatsApp), (c) las
**instrucciones de acceso por sede** en el mail, y (d) resolver los **pendientes que no se pagan** para
que no bloqueen el calendario.

---

## 3. Flujo completo (lo que hay que construir)

```
Público /alquiler
  → elige sala  (muestra m², equipamiento, foto — ya está)
  → calendario / día  (reusa lectura de ocupaciones de alquilar-sala)
  → elige horario libre
  → el sistema calcula el precio (tarifario de la sala)  ← NUEVO
  → carga nombre + email + teléfono
  → [Reservar y pagar]
        ↓ crea alquiler estado='pendiente' con token + hold (expira)   ← NUEVO
        ↓ crea preferencia MP (metadata.tipo_pago='alquiler', alquiler_id, token)  ← NUEVO (clonar evento-preference)
        ↓ redirige a MercadoPago (init_point)
  → paga
        ↓ webhook: rama 'alquiler' → estado='pagado', monto_pagado=total,
          caja_movimientos (ingreso), notificación in-app a recepción,
          mailAlquilerHTML con instrucciones de acceso   ← NUEVO (rama en webhook)
  → back_url success → /alquiler/reserva/[id]?t=token  (comprobante)   ← NUEVO (clonar /entradas)
```

Casos de borde a cubrir en la construcción:
- **Hold / expiración del pendiente.** Hoy un `alquiler` en estado `pendiente` ya bloquea el horario
  (ver el `.in('estado', ['confirmado','pagado','pendiente'])`). Si alguien arranca el pago y no lo
  termina, el slot queda muerto. Agregar `reservado_hasta` (p. ej. +15 min) y, al leer disponibilidad,
  ignorar los pendientes vencidos; un cron o un chequeo lazy los marca `anulado`.
- **Doble reserva simultánea.** Dos personas pidiendo el mismo horario: el chequeo de choques tiene que
  correr **en el servidor al crear la orden** (no solo en el cliente), reusando la lógica de
  `editarAlquilerFechaHoraAction`. Último control antes de confirmar en el webhook.
- **Precio = 0 / sala sin tarifa.** Si la sala no tiene tarifario cargado para ese horario, no ofrecer
  pago online: caer al botón de WhatsApp actual (fallback).
- **Mínimos y topes.** Decidir duración mínima (1 h), bloques (30/60 min), horario de apertura del local.

---

## 4. Modelo de datos (cambios)

Casi todo entra en tablas existentes. Nuevas columnas sobre `alquileres`:

```sql
alter table alquileres add column if not exists token uuid default gen_random_uuid();
alter table alquileres add column if not exists origen text default 'recepcion'; -- 'recepcion' | 'online'
alter table alquileres add column if not exists cliente_email text;
alter table alquileres add column if not exists mp_preference_id text;
alter table alquileres add column if not exists mp_payment_id text;
alter table alquileres add column if not exists reservado_hasta timestamptz; -- hold del pendiente online
```

Instrucciones de acceso por sede (para el mail "cómo abrir"):

```sql
alter table sedes add column if not exists instrucciones_acceso text; -- texto/HTML: cómo entrar, código, piso, timbre
```

> Alternativa: guardar las instrucciones por **sala** si varían dentro de una misma sede. Por ahora
> alcanza con `sedes` (es la info de "cómo llegar y abrir el local").

Nada de esto rompe el panel interno existente (columnas nuevas con default).

---

## 5. Puntos de entrada / UI

- **Pública:** en [alquiler/page.tsx](../app/alquiler/page.tsx), el botón "CONSULTAR DISPONIBILIDAD"
  (hoy WhatsApp) pasa a abrir el **flujo de reserva** (calendario → horario → precio → pagar). Mantener
  WhatsApp como fallback para "sala fija por mes" y para salas sin tarifa online.
- **Confirmación:** nueva ruta pública `/alquiler/reserva/[id]` (token), clon liviano de `/entradas`.
- **Interno:** en [alquileres/page.tsx](<../app/(dashboard)/alquileres/page.tsx>) marcar visualmente las
  reservas con `origen='online'` (badge), para que recepción distinga las autogestionadas. No requiere
  lógica nueva: caen en la misma tabla y ya se cobran/editan igual.
- **Tarifas:** el editor de tarifas ya existe en el panel; asegurarse de que todas las salas alquilables
  online tengan tarifario cargado (si no, no aparecen para pago online).

---

## 6. Orden sugerido de implementación (por etapas, shippeable)

1. **Migración** de columnas (sección 4) + cargar `instrucciones_acceso` por sede. (bajo riesgo)
2. **Precio automático público:** reusar el cálculo del tarifario del panel interno en un helper
   compartido, y mostrarlo en la página pública al elegir sala+horario (todavía sin pago: validación).
3. **Crear orden + preferencia MP** (`/api/mercadopago/alquiler-preference`, clon de evento-preference)
   con `metadata.tipo_pago='alquiler'`, creando el `alquiler` pendiente con `token` y `reservado_hasta`.
   Chequeo de choques **en el servidor** antes de crear.
4. **Rama `alquiler` en el webhook:** confirmar, `caja_movimientos`, notificación in-app, mail.
   `mailAlquilerHTML` con fecha/horario/sala + `instrucciones_acceso`.
5. **Página de confirmación** `/alquiler/reserva/[id]` (comprobante por token).
6. **Enchufar la UI pública** (`/alquiler`): reemplazar el botón WhatsApp por el flujo, con fallback.
7. **Expiración de pendientes** (lazy al leer disponibilidad + opcional cron pg_cron) para no matar slots.
8. **Badge `online`** en el panel interno + verificación de que las reservas online se liquidan/cuadran
   igual que las de recepción.

Etapas 1–2 ya dejan valor visible (precio automático). El pago real entra en 3–6.

---

## 7. Decisiones abiertas (para Nico / Santi antes de arrancar)

1. **¿Pago total o seña?** El sistema ya soporta `seña_pagada`. ¿El cliente online paga el 100 % o una
   seña (p. ej. 50 %) y el resto en el local?
2. **Cargo de servicio.** Los eventos suman 10 % de servicio arriba del precio. ¿El alquiler online
   también lleva un recargo por usar MP, o se absorbe?
3. **Duración mínima y bloques.** ¿Mínimo 1 h? ¿Bloques de 30 o 60 min? ¿Horario de apertura/cierre por
   sede para no ofrecer las 24 h?
4. **Ventana de hold.** ¿Cuántos minutos se reserva el slot mientras paga? (sugerido: 15).
5. **Qué salas se alquilan online.** ¿Las dos sedes (Obelisco y Congreso) o se empieza por una?
6. **Instrucciones de acceso.** Texto exacto por sede: cómo llegar, piso, timbre, código, horario de
   ingreso, reglas (devolver llave, dejar la sala como estaba, etc.). ¿El código es fijo o rota?
7. **Cancelación / reprogramación.** ¿El cliente puede cancelar o cambiar? ¿Con cuánta anticipación?
   ¿Reembolso por MP o crédito? (hoy el reembolso MP ya existe para eventos y se puede reusar).
8. **Confirmación anti-fraude.** El webhook confirma solo con pago `approved`; no hace falta nada manual,
   pero conviene que recepción reciba la notificación in-app igual (ya resuelto en el patrón).

---

## 8. Riesgos / notas

- **Zona horaria:** `alquileres` usa `fecha` (YYYY-MM-DD) + `hora_inicio`/`hora_fin` separadas, no
  timestamps, así que no sufre el bug UTC que tuvieron los eventos. Mantener ese modelo para el público.
- **Mails apagados por defecto:** `mail.ts` no envía si faltan `RESEND_API_KEY` + `MAIL_FROM`. Verificar
  que estén en Vercel antes de depender del mail de acceso (si no, la confirmación queda solo en pantalla).
- **El chequeo de choques del cliente no es suficiente:** siempre repetir en el servidor al crear la
  orden y, idealmente, un último control en el webhook antes de marcar `pagado`.
