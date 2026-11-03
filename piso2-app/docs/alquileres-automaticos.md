# ALQUILER DE SALA AUTOMÁTICO — Reserva online + cobro

> **Estado:** planificado (pendiente de construir). Referencia que se quiere replicar:
> **ritmiafusion.com/alquiler-sala** (wizard 3 pasos: fecha → horario → confirmar + pago).
> Este doc organiza el proyecto en **2 FASES** y deja las decisiones abiertas marcadas.
>
> **Idea rectora:** que el usuario **reserve y pague la seña online** y la sala le quede guardada,
> sin que recepción tenga que cargar nada a mano. Reutiliza lo que YA existe (tabla `alquileres`,
> tarifas en `salas`, chequeo de choques, pagos MP) y lo lleva al autoservicio.

---

## 1. Decisiones ya tomadas (con Juan)

1. **Quién reserva:** **usuario logueado** (no público). `/alquilar-sala` ya vive en `(dashboard)` → requiere login de 2M.
2. **La seña guarda la sala:** paga una **seña** por MP → la reserva queda **confirmada** y el slot bloqueado. El saldo se paga después / en el lugar.
3. **Salas, sedes y tarifas = las que funcionan HOY** (no el modelo por personas de Ritmia). Tarifas viven en `salas` (`precio`, `precio_finde`, `precio_manana`, `precio_noche`). Multi-sede ya existe.
4. **El cobro se asienta en un lugar específico de alquileres** y **cae en el pozo de liquidaciones de los admins** (= `caja_movimientos` con `origen='alquiler'` y **`turno_id = null`** → dinero digital del pozo, no en un turno de recepción).
5. **Disponibilidad:** el horario ocupado se calcula cruzando **clases + otros alquileres + obras (eventos)**.

---

## 2. Qué YA existe y se reutiliza

| Necesidad | Ya existe | Dónde |
|---|---|---|
| Tabla de reservas con fecha/hora/sala/estado/seña | `alquileres` (`fecha, hora_inicio, hora_fin, sala_id, monto_total, monto_pagado, estado_pago ['pendiente'\|'seña_pagada'\|'pagado'], estado, metodo_pago, cliente_nombre/contacto, group_id`) | `app/actions/alquileres.ts` |
| Tarifas por sala (franja/finde) | `salas.precio / precio_manana / precio_noche / precio_finde` | `actualizarTarifaAction` |
| Chequeo de choque (clases + alquileres) | `editarAlquilerFechaHoraAction` + `fetchOcupaciones` | `alquileres.ts`, `app/(dashboard)/alquilar-sala/page.tsx` |
| Página de usuario (hoy manda WhatsApp) | `/alquilar-sala` (ya logueada) | `app/(dashboard)/alquilar-sala/page.tsx` |
| Pago online + webhook por `metadata.tipo_pago` | MP (Ventas / Eventos / La Liga 2027) | `app/api/mercadopago/*` |
| Pozo de admins (dinero digital) | `caja_movimientos` con `turno_id null` | `app/actions/liquidaciones.ts` |
| Panel de recepción de alquileres | `/alquileres` | `app/(dashboard)/alquileres/page.tsx` |

**Lo único nuevo de verdad:** el **autoservicio** (que el usuario elija slot, vea precio en vivo y pague la seña solo) + sumar **obras** al cálculo de ocupación + asentar el cobro en el **pozo con origen `alquiler`**.

---

## FASE 1 — Reserva online + seña (cobro automático)
**Entregable:** el usuario reserva solo, paga la seña por MP y la sala le queda guardada; el dinero cae en el pozo con origen "alquiler".

### 1.1 — Wizard de reserva (estilo Ritmia, estética 2M)
- **Sede → Sala → Fecha → Hora de inicio + Duración** (bloques de 30', mínimo 1h).
- **Precio en vivo** = tarifa de la sala según la franja/día (mañana/noche/finde) × duración.
- **Disponibilidad en vivo:** muestra solo los slots libres, cruzando **clases + alquileres + obras (eventos)**.

### 1.2 — Seña + cobro automático (MP)
- Al confirmar, genera **preference MP por la seña** (`metadata.tipo_pago='alquiler'`, con el `alquiler_id`).
- Mientras no paga, la reserva queda `pendiente` con **expiración corta** (p.ej. 15 min) para no bloquear el slot de gusto.
- **Webhook** al acreditar: `estado='confirmado'`, `estado_pago='seña_pagada'`, `monto_pagado=seña`; **asienta `caja_movimiento`** con `origen='alquiler'`, `turno_id=null` (→ pozo admins).
- Chequeo anti-doble-reserva al confirmar (por si alguien tomó el slot mientras pagaba).

### 1.3 — Obras en la ocupación
- Sumar `eventos` (muestras/shows de 2E) al cálculo de choque, mapeando `eventos.fecha` + lugar/sala + rango horario. *(Verificar en implementación cómo guarda `eventos` el lugar/horario.)*

---

## FASE 2 — Multi-día, "mis reservas" y políticas
**Entregable:** reservar varias fechas de una, el usuario ve/gestiona sus reservas y rigen las políticas de cancelación.

- **Multi-día:** reservar hasta N fechas/horarios en una operación (usa `group_id`, que ya existe).
- **"Mis reservas"** (usuario): ver próximas, saldo pendiente, cancelar según política.
- **Políticas:** cancelación gratis con 48hs; sin cambios/cancelación dentro de 48hs (devolución de seña a definir).
- **Saldo:** pagar el resto online o en el lugar (a definir).
- Recordatorios / aviso de saldo (reutiliza mail/notificaciones).

---

## 3. Decisiones tomadas (Juan, nov 2026)

1. **Seña = 50% del total.**
2. **Expiración del slot** sin seña paga: **15 minutos** (después se libera).
3. **Saldo:** se puede pagar **de ambas formas** (online o en el lugar).
4. **Cancelación dentro de 48hs:** **se pierde la seña** (no se devuelve).
5. **Tarifa:** las **franjas actuales** (mañana/noche/finde) — NO por cantidad de personas.

### Quedan por confirmar en implementación
6. **Obras:** cómo `eventos` guarda sala/sede y horario para el choque.
7. **Comprobante:** mail de confirmación de reserva al usuario (nice-to-have).

---

## 4. Notas de implementación
- Construir con **migraciones por etapa** (Juan corre la migración → push), como La Liga.
- Las escrituras sensibles (crear reserva, acreditar seña) van por **server action / webhook con service role**; el chequeo de disponibilidad se re-valida en el server al confirmar (no confiar solo en el cliente).
- El panel de recepción `/alquileres` sigue funcionando igual; estas reservas automáticas aparecen ahí como una más (ya confirmadas y con seña).
