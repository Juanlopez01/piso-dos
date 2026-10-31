# LA LIGA 2027 — Programa de formación y desarrollo profesional

> **Estado:** planificado, sin implementar. Este doc organiza el proyecto en **3 FASES** —cada una
> con su entregable y pensada para cotizarse por separado— y deja las definiciones a cerrar con la
> dirección antes de arrancar.
>
> **Origen:** pedido de Santi (26/10/2026) + conversación de referencia (perfil del alumno con 4
> pestañas, régimen de asistencia y beneficios por categoría). Las maquetas son ideas de UI; acá
> se construye con el diseño del sistema PISO2.

---

## 1. Qué es

Un módulo que gestiona **LA LIGA** de punta a punta:

**inscripción pública 2027 → aprobación → pago de matrícula/cuotas → perfil del alumno con
seguimiento académico (notas, asistencia, programa, beneficios) → portal docente → coordinación.**

Con un **botón "Inscripciones 2027" destacado apenas entrás a la página**.

El corazón es el **perfil del alumno**, con **4 pestañas**:

1. **Evaluaciones** — notas A/B/C por disciplina + devolución del docente.
2. **Asistencias** — presentes/ausentes + condición de regularidad (régimen de faltas).
3. **Programa** — contenidos por bloque; el bloque 2 bloqueado hasta aprobar el 1.
4. **Beneficios** — ventajas según la letra del promedio general (A/B/C).

---

## 2. Resumen de las 3 fases (para cotizar)

| Fase | Qué incluye | Entregable (qué queda funcionando) | Precio |
|---|---|---|---|
| **FASE 1 — Inscripción + Pagos** | Landing con botón 2027, inscripción (3 CTAs), aprobación, perfil base, matrícula/cuotas + bloqueo por mora | PISO2 **lanza, inscribe y cobra** online. El alumno tiene su perfil y su estado de pago. | _a definir_ |
| **FASE 2 — Seguimiento académico** | Evaluaciones A/B/C + devoluciones, **asistencias + régimen de regularidad**, programa por bloques, portal docente (cargas) | El alumno ve **notas, asistencia y programa**; los docentes cargan todo; el sistema detecta **libres** automáticamente. | _a definir_ |
| **FASE 3 — Beneficios + Coordinación** | Beneficios por categoría A/B/C, vista de coordinación, alertas y gestión fina | El rendimiento **desbloquea beneficios**; coordinación ve todo (sin pagos); alertas automáticas. | _a definir_ |

> Las fases son **incrementales**: con la Fase 1 ya se puede operar (inscribir y cobrar); las
> Fases 2 y 3 agregan el seguimiento académico y la capa de beneficios/gobierno.

---

## 3. Qué YA existe y se reutiliza (clave para ir rápido y para justificar el precio)

| Necesidad | Ya existe | Archivo |
|---|---|---|
| Postulación pública → crea perfil + lista para aprobar/rechazar | **Talent** (perfiles con cuenta, aprobación, mensajes) | `app/actions/talent.ts`, `app/actions/talent-auth.ts`, `app/talent/*` |
| Cuenta propia con login (email + contraseña) separada de alumnos | Talent login (cookie HMAC + scrypt) | `lib/talent-session.ts` |
| Notas por materia+cuatrimestre con profesor_id | `liga_evaluaciones` | `app/actions/liga.ts` |
| Asistencia de La Liga (staff) | `getAsistenciasRangoStaffAction`; inscripciones con `estado_asistencia`/`presente` | `app/actions/liga.ts`, `inscripciones` |
| Niveles / becas / padrón / precios / cuotas por nivel-mes | `cambiarNivelLigaAction`, `asignarBecaAction`, `inscribirPadronLigaAction`, `getPreciosLigaAction`, `guardarCuotaLigaMesAction` | `app/actions/liga.ts` |
| Pagos + link de pago MP + webhook por `metadata.tipo_pago` | Ventas externas / MP (ya tiene rama `cuota_liga`) | `app/actions/ventas.ts`, `app/api/mercadopago/*` |
| Subida de foto de perfil | uploader + bucket `talent` | `app/(dashboard)/perfil`, `app/talent/mi-perfil` |
| Mails (bienvenida, avisos) | `lib/mail.ts` (`enviarMail`, layout) | `lib/mail.ts` |
| Home con botones 2M/2E/2S | `LandingClient` | `app/LandingClient.tsx` |
| Acortador de links (compartir) | `short_links` + `acortarLinkAction` | `app/actions/talent.ts` |
| Cobros/ajustes desde caja (matrícula presencial) | caja (apertura/cierre, movimientos) | panel caja |
| Bloqueos/recálculos automáticos por fecha | patrón `pg_cron` / `after()` | migraciones SQL |

**Idea rectora:** LA LIGA 2027 ≈ "Talent (postulación + perfil con cuenta)" + lo que ya tiene el
módulo La Liga (evaluaciones, asistencias, cuotas, becas, niveles), unificado en un **perfil de
alumno** con seguimiento académico y pagos.

---

## 4. Roles

| Rol | Puede |
|---|---|
| **Alumno La Liga** | Ver su perfil (4 pestañas), estado de pago, aplicar a cosas de la página. |
| **Docente La Liga** | Ver **solo los alumnos de SU disciplina**. **Obligatorio por clase:** cargar contenido, método de evaluación, tomar presente; **por examen:** puntuar A/B/C + observaciones; informar **reemplazo con contacto**. |
| **Coordinadora** | Ve **todo menos la info administrativa de pagos**. |
| **Recepción La Liga** | Lista de perfiles; toma asistencia; aprueba postulaciones; envía link de pago/mensajes. |
| **Admin / Finanzas** | Todo + matrícula, planes, precios, bloqueos, gestión de libres. |

> Roles existentes: `profesor`, `coordinador`, `recepcion`, `admin`, `alumno`.
> **A definir:** "docente La Liga" = `profesor` filtrado por disciplina, o flag/rol propio.
> Coordinadora = `coordinador` con gate de "no ver pagos".

---

# FASE 1 — Inscripción + Pagos
**Entregable:** PISO2 lanza el programa, inscribe online y cobra. El alumno tiene su perfil y ve su estado de pago.

### Etapa 1.1 — Lanzamiento + landing "Inscripciones 2027"
- Bloque/CTA destacado en `LandingClient` (apenas entrás a la página) cuando hay un lanzamiento activo.
- Página pública del programa: **video explicativo** + descripción de las etapas del programa.
- Panel para prender/apagar, cambiar video y textos (sirve para futuros lanzamientos).

**Datos:** `liga_lanzamientos (id, titulo, subtitulo, video_url, cta_texto, slug, activo, orden, creado_at)`.

### Etapa 1.2 — Inscripción (postulación) + aprobación + link de pago
- Form público con **3 CTAs**: "Quiero que me llamen" / "Quiero que me escriban" /
  "Quiero anotarme directamente" (datos + foto → crea **perfil postulado con cuenta**).
- Lista de **perfiles postulados** (como Talent): aprobar / no aprobar, **mensaje directo** y
  **envío del link de pago de matrícula**.

**Reutiliza:** flujo de perfiles con cuenta de Talent (registro/login, reclamo por email).
**Datos:** `liga_postulaciones (id, nombre, email, telefono, instagram, fecha_nac, ciudad,
foto_url, tipo_contacto ['llamar'|'escribir'|'anotarse'], nota, estado ['pendiente'|'aprobada'|'no'],
perfil_id, lanzamiento_id, creado_at)`.

### Etapa 1.3 — Perfil del alumno (base) + bienvenida
- Perfil con **foto, datos, promedio general (letra A/B/C)** y las **4 pestañas** (shell).
- Estado: `postulado` → `aprobado` → `bloqueado`.
- **Mensaje de bienvenida** (mail / WhatsApp) al liberar el perfil.

**Datos:** `liga_inscripciones (id, perfil_id, estado, anio_ingreso, letra_actual, promedio_letra,
matricula_pagada, plan ['mensual'|'cuatrimestral'], bienvenida_enviada, creado_at)`.

### Etapa 1.4 — Pagos (matrícula + cuotas + bloqueo por mora)
- **Matrícula** (link MP y/o caja) y **planes**: mensual / cuatrimestral (cuatrimestral = mantiene
  precio pagando los 4 meses juntos, o cuota por mes al precio pactado).
- **Bloqueo por mora:** si al **día 10** del mes no está pago → perfil **bloqueado** con cartel
  "Comunicate con el área administrativa". Se desbloquea al registrar el pago.

**Reutiliza:** MP (`metadata.tipo_pago = 'cuota_liga'` ya existe), webhook, caja, `pg_cron`.
**Datos:** `liga_pagos (id, inscripcion_id, concepto ['matricula'|'cuota'], mes, anio, monto,
estado, metodo, pagado_at, mp_ref)`.

---

# FASE 2 — Seguimiento académico
**Entregable:** el alumno ve notas, asistencia y programa; los docentes cargan todo; el sistema detecta "libres" solo.

### Etapa 2.1 — Evaluaciones (notas A/B/C + devoluciones) · pestaña 1
- **6 disciplinas**, **2 exámenes** por disciplina, nota **A/B/C** por examen.
- Cada examen con **devolución escrita** del docente (desplegable en el perfil del alumno).
- **Promedio general** → determina la **letra A/B/C** del alumno (alimenta la Fase 3).

**Reutiliza/extiende:** `liga_evaluaciones` (ya es por materia+cuatrimestre con profesor_id).
**Datos:** `liga_disciplinas (id, nombre, anio, bloque, docente_id, orden)`,
`liga_examenes (id, disciplina_id, numero [1|2], fecha, libera_bloque)`,
`liga_alumno_examen (inscripcion_id, examen_id, puntaje, observaciones, actualizado_at)`.

### Etapa 2.2 — Asistencias + régimen de regularidad · pestaña 2  ⭐ (lo nuevo del pedido)
Registrar asistencia y que el sistema detecte **automáticamente** cuándo un alumno queda libre,
distinguiendo "libre del mes" de "libre del bloque".

**Reglamento de asistencia:**

| Situación | Consecuencia |
|---|---|
| 1 falta en el mes | **Permitida** |
| 2 faltas en la **misma disciplina** en un mes | Queda **libre de esa disciplina ese mes** |
| **+4 faltas** en una disciplina en el cuatrimestre | Queda **libre de esa disciplina todo el bloque** |
| Alumno **libre del bloque** | Debe **rendir la disciplina en condición de libre** y **volver a pagar la matrícula** |

- **Dos estados separados:** `libre_mes` (disciplina+mes) ≠ `libre_bloque` (disciplina+bloque).
- El alumno ve, por disciplina: presentes, ausentes, **faltas acumuladas** y su **condición de regularidad**.
- **Alertas** al alumno y a administración al acercarse/alcanzar un límite.
- **Administración** puede: consultar los **libres**, gestionar **inscripción al examen libre +
  nuevo pago de matrícula**, y **corregir asistencias / justificar excepciones** con **historial**.

**Reutiliza:** asistencias actuales + pagos de la Fase 1 (para el examen libre).
**Datos:** `liga_asistencia (id, inscripcion_id, disciplina_id, clase_fecha, presente, justificada,
modificada_por, modificada_at)`; condición derivada (vista o cron al cierre de mes).

> **Decisión clave:** "+4 faltas en el cuatrimestre" → **¿por disciplina o sumando todas?**
> La maqueta lo tomó **por disciplina**. Confirmar antes de programar "libre del bloque".

### Etapa 2.3 — Programa · pestaña 3 + portal docente (cargas)
- Contenidos del **Bloque 01**; **Bloque 02 bloqueado (gris)** hasta que PISO2 confirme requisitos.
- **Portal docente:** cada docente ve los alumnos de su disciplina y **carga por clase**
  (contenido, método de evaluación, presente) y **por examen** (A/B/C, observaciones, reemplazo).

**Datos:** `liga_clases_contenido (id, disciplina_id, clase_fecha, contenido, metodo_evaluacion,
remplazo_nombre, remplazo_contacto, cargado_por)`.

---

# FASE 3 — Beneficios + Coordinación
**Entregable:** el rendimiento desbloquea beneficios; coordinación ve todo (sin pagos); alertas automáticas.

### Etapa 3.1 — Beneficios por categoría A/B/C · pestaña 4
- Categoría **A/B/C automática** según el **promedio general** (no editable por el alumno).
- El alumno **consulta las 3 categorías** pero solo tiene **activos los de su letra** (para que vea
  qué puede alcanzar mejorando).
- **Asignación al cierre de cada bloque** (no después de cada examen), para evitar cambios constantes.

**Datos:** `liga_beneficios (letra ['A'|'B'|'C'], beneficios jsonb/texto)`.

> **Decisión:** definir los **beneficios concretos** de A, B y C (descuentos, audiciones, salas,
> becas, actividades, acceso a oportunidades…).

### Etapa 3.2 — Coordinación + alertas
- **Coordinadora:** vista total **sin** info de pagos.
- **Alertas automáticas** (regularidad en riesgo, libres, mora) al alumno y a administración.

---

## 5. Decisiones abiertas (cerrar con Santi antes de construir)

1. **Faltas del cuatrimestre:** ¿"+4 faltas" es **por disciplina** o **sumando las 6**? *(maqueta: por disciplina).* — **Fase 2**
2. **Cálculo de la letra:** ¿del promedio de notas A/B/C (A=3, B=2, C=1)? ¿nota numérica detrás? ¿qué rango define cada letra? — **Fase 2/3**
3. **Beneficios A/B/C:** lista concreta por letra, y si son **informativos** o **acciones reales**. — **Fase 3**
4. **Bloques:** ¿2 años con 2 bloques c/u? ¿"bloque 2 bloqueado" por año o del programa completo? ¿"cuatrimestre" = "bloque"? — **Fase 2**
5. **Matrícula y planes:** montos; en cuatrimestral pagando una por mes, ¿qué pasa si se atrasa? El "volver a pagar matrícula" del libre, ¿es matrícula completa? — **Fase 1/2**
6. **Bloqueo día 10:** ¿bloqueo total del perfil o solo del seguimiento? ¿se desbloquea solo al registrar el pago? — **Fase 1**
7. **Disciplinas y docentes 2027:** ¿lista fija de 6? ¿un docente por disciplina? ¿rol propio o `profesor` filtrado? — **Fase 2**
8. **Examen libre:** ¿quién lo habilita, con qué fecha y cómo se cobra (MP/caja)? — **Fase 2**

---

## 6. Notas de implementación

- La mayor parte del trabajo es **modelar el perfil del alumno (4 pestañas)** + el **seguimiento
  académico/asistencia/pagos** + el **portal docente**; buena parte de la infraestructura ya existe.
- Construir con **migraciones por etapa** (Juan corre la migración → push), como venimos trabajando.
- Reutiliza fuerte: **Talent** (postulación + perfil con cuenta) y **La Liga actual** (evaluaciones,
  asistencias, cuotas, becas, niveles) + **MP/caja** para pagos.
- Las **dos decisiones que más condicionan el código** son el cálculo de "libre del bloque" (Fase 2)
  y el de la letra del promedio (Fase 2/3): conviene cerrarlas antes de empezar esas fases.
