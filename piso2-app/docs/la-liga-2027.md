# Experiencia La Liga 2027 — Plan de implementación

> Spec organizado a partir del pedido de Santi (26/10/2026). Objetivo: dejarlo pensado para
> que, cuando se construya, se avance rápido. **No implementado todavía.**

---

## 1. Objetivo

Un módulo para gestionar el programa **La Liga** de punta a punta:
inscripción pública → aprobación → pago de matrícula/cuotas → perfil del alumno con
seguimiento (disciplinas, notas A/B/C, promedio, exámenes, asistencia, beneficios),
perfil docente y vista de coordinación. Con un **punto de entrada destacado** en el home
cuando hay lanzamiento.

---

## 2. Qué YA existe y se reutiliza (clave para ir rápido)

| Necesidad | Ya existe | Archivo |
|---|---|---|
| Postulación pública → crea perfil + lista para aprobar/rechazar | **Talent** (`talent_postulaciones`, `crearPostulacionTalentoAction`, `aceptar/standby/eliminarPostulacion`) | `app/actions/talent.ts`, `app/talent/*` |
| Postulación "abierta" por fuera de convocatorias (CTA + form) | Convocatoria / ficha | `app/convocatoria/*` |
| Notas por materia+cuatrimestre con profesor_id | `liga_evaluaciones` (`guardarEvaluacionAction`, `getNotasDeAlumnoAction`, `getEvaluacionesDeMateriaAction`) | `app/actions/liga.ts` |
| Asistencia de La Liga (staff) | `getAsistenciasRangoStaffAction`; inscripciones con `estado_asistencia`/`presente` | `app/actions/liga.ts`, `inscripciones` |
| Niveles / becas / padrón / precios / cuotas por nivel-mes | `cambiarNivelLigaAction`, `asignarBecaAction`, `inscribirPadronLigaAction`, `getPreciosLigaAction`, `guardarCuotaLigaMesAction` | `app/actions/liga.ts` |
| Pagos + link de pago MP | Ventas externas / MP (`crearOrden`, webhook) | `app/actions/ventas.ts`, `app/api/mercadopago/*` |
| Subida de foto de perfil | `profiles.foto_url` + uploader (Talent/Perfil) | `app/(dashboard)/perfil`, bucket `talent` |
| Mails (bienvenida, avisos) | `lib/mail.ts` (`enviarMail`, layout) | `lib/mail.ts` |
| Cuenta de usuario (perfil navegable) | auth + `profiles` + rol | `utils/supabase`, `profiles` |
| Home con botones 2M/2E/2S | `LandingClient` (menú interactivo) | `app/LandingClient.tsx` |
| Acortador de links (para compartir) | `short_links` + `acortarLinkAction` | `app/actions/talent.ts` |

**Idea rectora:** La Liga 2027 es "Talent para La Liga" + lo que ya tiene el módulo La Liga,
unificado en un **perfil de alumno** con seguimiento y pagos.

---

## 3. Flujo completo (los 3 pasos de Santi) + quién hace qué

### Paso 1 — Info + postulación (crea perfil)
- Página pública con **video explicativo** del programa + **formulario**.
- 3 CTAs:
  - **"Quiero que me llamen"** (deja tel)
  - **"Quiero que me escriban"** (deja contacto)
  - **"Quiero anotarme directamente"** (completa datos + foto → crea perfil postulado)
- Se arma la **lista de perfiles postulados** (como Talent).
- Recep/Coordinación: **aprobar / no aprobar**; **mensaje directo** para comunicarse y
  enviar **link de pago de matrícula**.

### Paso 2 — Perfil aprobado
- Pagar **matrícula**.
- **Planes de pago**: mensual / cuatrimestral (cuatrimestral: mantiene precio pagando 4
  meses juntos, o una cuota por mes manteniendo el precio pactado).

### Paso 3 — Perfil liberado en el programa
- **Mensaje de bienvenida** (mail/WhatsApp).
- Perfil muestra: datos del alumno + **foto** + **promedio general (letra A/B/C)**.
- **Ficha completa** con el programa (disciplinas de los 2 años).
- **Fechas de examen 1 y 2.**
- **Segundo bloque bloqueado (gris)** hasta rendir el primero.
- **Beneficios** según la letra.

### Seguimiento del programa (perfil activo)
- Disciplinas de **ambos años**.
- **Puntaje A-B-C por disciplina** + **promedio general**.
- Fechas de exámenes + **devoluciones** (feedback).
- **Asistencia** propia (solapa aparte del alumno).

### Pagos / bloqueo
- Actualizaciones de pago.
- Si al **día 10** de cada mes no está pago el arancel → **perfil bloqueado**
  con cartel "Comunicate con el área administrativa".
- **Beneficios por letra** (A/B/C): descuentos, audiciones, salas de ensayo.

---

## 4. Roles y permisos

| Rol | Puede |
|---|---|
| **Alumno La Liga** (perfil) | Ver su perfil, foto, datos, disciplinas, notas, promedio, exámenes, asistencia propia, beneficios, estado de pago. Aplicar a cosas de la página. |
| **Docente La Liga** | Ver **solo los alumnos de SU disciplina**, con fechas de cada clase. **Obligatorio**: cargar el contenido de cada clase, el método de evaluación en cada fecha, puntuar A-B-C, observaciones de examen, **remplazo con contacto**, y **tomar presente en cada clase**. |
| **Coordinadora** | Ve **todo menos la info administrativa de pagos**. |
| **Recep La Liga** | Lista de todos los perfiles; **toma asistencia**; aprobar postulaciones; enviar link de pago/mensajes. |
| **Admin / Finanzas** | Todo + pagos, matrícula, planes, precios, bloqueos. |

> Roles existentes: `profesor`, `coordinador`, `recepcion`, `admin`, `alumno`.
> Evaluar: queda definir si "docente La Liga" = `profesor` filtrado por su disciplina, o un
> flag/rol propio. Coordinadora = `coordinador` (ya existe) con gate de "no ver pagos".

---

## 5. Modelo de datos (nuevo / a extender)

> Reusar `profiles` para el perfil del alumno (foto_url, datos). La Liga ya tiene tablas
> (`liga_evaluaciones`, cuotas, becas). Lo nuevo:

- **`liga_lanzamientos`** (el "lanzamiento" destacado del home)
  `id, titulo, subtitulo, video_url, activo, orden, cta_texto, slug, creado_at`.
  (Para poder prender/apagar el destacado y cambiar el video sin tocar código.)
- **`liga_postulaciones`** (o reusar patrón Talent)
  `id, nombre, email, telefono, instagram, edad/fecha_nac, ciudad, foto_url,
   tipo_contacto ('llamar'|'escribir'|'anotarse'), nota, estado ('pendiente'|'aprobada'|'no'),
   perfil_id (al aprobar), lanzamiento_id, creado_at`.
- **`liga_inscripciones`** (alumno dentro del programa, "perfil aprobado")
  `id, perfil_id, estado ('aprobado'|'bloqueado'), anio_ingreso, nivel/letra_actual,
   promedio_letra, matricula_pagada (bool), plan ('mensual'|'cuatrimestral'),
   bienvenida_enviada, creado_at`.
- **`liga_disciplinas`** (catálogo de disciplinas por año/bloque)
  `id, nombre, anio (1|2), bloque (1|2), docente_id, orden`.
- **`liga_alumno_disciplina`** (nota por alumno+disciplina)
  `inscripcion_id, disciplina_id, puntaje ('A'|'B'|'C'|null), observaciones, actualizado_at`.
  *(o extender `liga_evaluaciones` que ya es por materia+cuatrimestre.)*
- **`liga_examenes`** (fechas de examen 1 y 2 por disciplina/bloque)
  `id, disciplina_id, numero (1|2), fecha, libera_bloque (bool)`.
- **`liga_clases_contenido`** (lo que el docente DEBE cargar por clase)
  `id, clase_id, contenido, metodo_evaluacion, remplazo_nombre, remplazo_contacto, cargado_por`.
- **`liga_pagos`** (arancel mensual / matrícula)
  `id, inscripcion_id, concepto ('matricula'|'cuota'), mes, anio, monto, estado, metodo, pagado_at, mp_ref`.
- **`liga_beneficios`** (qué desbloquea cada letra)
  `letra ('A'|'B'|'C'), beneficios (texto/jsonb: descuentos, audiciones, salas)`.
- **Asistencia**: reusar `inscripciones` (es_la_liga) + `estado_asistencia`/`presente`, o una
  `liga_asistencia (inscripcion_id, clase_id, presente, fecha)` si conviene separarlo.

> **Bloqueo por pago (día 10):** campo calculado o un cron (ya hay patrón pg_cron / `after()`):
> si el día 10 no hay `liga_pagos` del mes → `liga_inscripciones.estado = 'bloqueado'`.
> El perfil muestra el cartel y se limita a "Comunicate con administración".

---

## 6. Punto de entrada en el home (lanzamiento)

- En `LandingClient`, **debajo del menú 2M/2E/2S**, si hay un `liga_lanzamientos.activo`:
  mostrar un **bloque destacado** ("La Liga 2027 — Inscripciones abiertas") que invite a verlo
  (animación/CTA) y lleve a la página de inscripción (Paso 1).
- Controlable desde un panel (prender/apagar, video, textos) para futuros lanzamientos.

---

## 7. Orden sugerido de implementación (para shippear por partes)

1. **Lanzamiento + landing** (destacado on/off + página pública con video). *Rápido, visible.*
2. **Paso 1: postulación** (3 CTAs) + lista de postulados + aprobar/rechazar + mensaje/link de pago. *Reusa Talent.*
3. **Perfil del alumno (base)**: foto, datos, estado (postulado/aprobado/bloqueado), navegación/aplicar.
4. **Pagos**: matrícula + planes + link MP + **bloqueo por día 10** + cartel.
5. **Seguimiento académico**: disciplinas (2 años/bloques), notas A/B/C, promedio, exámenes 1 y 2, **bloqueo del 2º bloque** hasta aprobar el 1º, devoluciones. *Extiende `liga_evaluaciones`.*
6. **Asistencia**: recep toma presente desde el listado; alumno la ve en su solapa. *Reusa asistencias.*
7. **Perfil docente**: alumnos de su disciplina, fechas de clase, contenido obligatorio, método de evaluación, A-B-C, observaciones, remplazo, presente.
8. **Coordinadora**: vista total sin pagos.
9. **Beneficios por letra** (A/B/C): descuentos, audiciones, salas.
10. **Bienvenida** (mail/WhatsApp) al aprobar/liberar.

---

## 8. Decisiones abiertas (confirmar con Santi antes de construir)

1. **Letras A/B/C:** ¿son por disciplina (cada materia tiene su letra) y el promedio general
   es el promedio de esas letras? ¿Cómo se promedia (A=3, B=2, C=1)? ¿Hay nota numérica detrás?
2. **Bloques y "segundo bloque":** ¿el programa son 2 años con 2 bloques c/u? ¿El "segundo
   bloque" que se libera al aprobar el primero es por año o del programa completo?
3. **Matrícula y planes:** montos de matrícula y cuota; "cuatrimestral mantiene precio
   pagando 4 meses de una" — ¿también aplica si paga una por mes? ¿Qué pasa si se atrasa en ese plan?
4. **Bloqueo día 10:** ¿bloqueo total del perfil o solo el seguimiento (deja ver "estás al día"/no)?
   ¿Se desbloquea solo al registrar el pago?
5. **Disciplinas y docentes:** ¿lista fija de disciplinas 2027? ¿un docente por disciplina?
   ¿"docente La Liga" es el rol `profesor` o uno nuevo?
6. **Coordinadora:** ¿`coordinador` actual alcanza? ¿"todo menos pagos" incluye no ver aranceles
   ni estado de pago de los alumnos?
7. **Aplicar "a lo que quiera" con el perfil:** ¿a qué puede aplicar un perfil además de La Liga
   (Talent, audiciones, grupos)? ¿se unifican las postulaciones bajo un mismo perfil?
8. **Beneficios por letra:** lista concreta (qué descuento, qué audiciones, qué salas) y si es
   texto informativo o acciones reales en el sistema.

---

## 9. Notas

- Mucho se apoya en lo existente → la mayor parte del trabajo es **modelar el perfil del alumno
  de La Liga** y **el seguimiento académico/pagos**, más el **punto de entrada** y el **perfil
  docente** con cargas obligatorias.
- Conviene construir con **migraciones por etapa** (como venimos: Juan corre la migración, después push).
- Candidato a reutilizar fuerte: Talent (postulación/aprobación) y La Liga actual (evaluaciones,
  asistencias, cuotas, becas, niveles).
