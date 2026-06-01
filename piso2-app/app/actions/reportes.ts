'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'

const getAdminClient = () => {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

export async function generarReporteMensualAction(mes: number, anio: number, companiasSeleccionadas: string[]) {
    const supabase = getAdminClient()

    try {
        // Fechas de inicio y fin de mes para las consultas
        const startDate = new Date(anio, mes - 1, 1).toISOString();
        const endDate = new Date(anio, mes, 0, 23, 59, 59).toISOString();

        // -------------------------------------------------------------
        // 1. PACKS COMPRADOS (Regulares vs Especiales)
        // -------------------------------------------------------------
        const { data: packs } = await supabase.from('alumno_packs')
            .select('tipo_clase, cantidad_inicial')
            .gte('fecha_compra', startDate)
            .lte('fecha_compra', endDate)
            .limit(10000);

        const reportePacks = {
            regular: { sueltas: 0, x4: 0, x8: 0, x12: 0, otros: 0, total_vendidos: 0 },
            especial: { sueltas: 0, x4: 0, x8: 0, x12: 0, otros: 0, total_vendidos: 0 }
        }

        packs?.forEach(pack => {
            const tipoPack = (pack.tipo_clase || '').toString().toLowerCase().trim();
            const esEspecial = tipoPack.includes('seminario') || tipoPack.includes('especial');
            const cat = esEspecial ? 'especial' : 'regular';
            const cant = pack.cantidad_inicial;

            reportePacks[cat].total_vendidos++;
            if (cant === 1) reportePacks[cat].sueltas++;
            else if (cant === 4) reportePacks[cat].x4++;
            else if (cant === 8) reportePacks[cat].x8++;
            else if (cant === 12) reportePacks[cat].x12++;
            else reportePacks[cat].otros++;
        });

        // -------------------------------------------------------------
        // 2. CLASES TOMADAS E INSCRIPTAS (Separación por Modalidad)
        // -------------------------------------------------------------
        let inscriptosRegulares = 0;
        let inscriptosEspeciales = 0;
        let tomadasRegulares = 0;
        let tomadasEspeciales = 0;

        let inscriptosLiga = 0;
        let tomadasLiga = 0;
        const statsCompanias: Record<string, { inscriptos: number, tomadas: number }> = {};

        // Traemos las clases con TODAS sus inscripciones, incluyendo la modalidad
        const { data: clasesConInsc } = await supabase.from('clases')
            .select('id, tipo_clase, compania_id, liga_nivel, es_la_liga, inscripciones(estado_asistencia, presente, modalidad)')
            .gte('inicio', startDate)
            .lte('inicio', endDate)
            .limit(10000);

        clasesConInsc?.forEach((clase: any) => {
            const tipoClaseStr = (clase.tipo_clase || '').toString().toLowerCase().trim();
            const esEspecial = tipoClaseStr.includes('especial') || tipoClaseStr.includes('seminario');
            const esCompania = !!clase.compania_id || tipoClaseStr.includes('compa') || tipoClaseStr.includes('formacion');
            const isPureLiga = tipoClaseStr === 'liga' || !!clase.liga_nivel;
            const acceptsLiga = clase.es_la_liga === true;

            const listaInscripciones = Array.isArray(clase.inscripciones) ? clase.inscripciones : [];

            listaInscripciones.forEach((insc: any) => {
                const estaPresente =
                    insc.presente === true ||
                    insc.estado_asistencia === 'presente' ||
                    insc.estado_asistencia === 'saf';

                const modalidad = (insc.modalidad || '').toString().toLowerCase().trim();
                const esInscLiga = modalidad === 'la liga' || modalidad === 'liga';

                // 1. ¿Pertenece a una Compañía?
                if (esCompania && clase.compania_id) {
                    if (!statsCompanias[clase.compania_id]) {
                        statsCompanias[clase.compania_id] = { inscriptos: 0, tomadas: 0 };
                    }
                    statsCompanias[clase.compania_id].inscriptos++;
                    if (estaPresente) statsCompanias[clase.compania_id].tomadas++;
                }
                // 2. ¿Es una Clase Especial/Seminario?
                else if (esEspecial) {
                    inscriptosEspeciales++;
                    if (estaPresente) tomadasEspeciales++;
                }
                // 3. ¿Es una clase 100% Liga o un alumno que usó La Liga en una regular?
                else if (isPureLiga || (acceptsLiga && esInscLiga)) {
                    inscriptosLiga++;
                    if (estaPresente) tomadasLiga++;
                }
                // 4. Si no es nada de lo anterior, es un alumno Regular/Exclusivo
                else {
                    inscriptosRegulares++;
                    if (estaPresente) tomadasRegulares++;
                }
            });
        });

        // -------------------------------------------------------------
        // 3. LA LIGA (Participantes, Recaudación, Profesores)
        // -------------------------------------------------------------
        const { data: pagosLiga } = await supabase.from('liga_pagos')
            .select('monto, alumno_id')
            .eq('mes', mes).eq('anio', anio)
            .limit(10000);

        const recaudacionLiga = pagosLiga?.reduce((a, b) => a + Number(b.monto), 0) || 0;
        const participantesLiga = new Set(pagosLiga?.map(p => p.alumno_id)).size;

        const { data: clasesLiga } = await supabase.from('clases')
            .select('id, valor_acuerdo, tipo_acuerdo, inscripciones(valor_credito)')
            .eq('es_la_liga', true)
            .gte('inicio', startDate)
            .lte('inicio', endDate)
            .limit(10000);

        let pagoProfesLiga = 0;
        clasesLiga?.forEach((clase: any) => {
            const acuerdo = Number(clase.valor_acuerdo) || 0;
            if (clase.tipo_acuerdo === 'fijo') {
                pagoProfesLiga += acuerdo;
            } else {
                const recaudoClase = clase.inscripciones?.reduce((acc: number, cur: any) => acc + (Number(cur.valor_credito) || 0), 0) || 0;
                pagoProfesLiga += recaudoClase * (acuerdo / 100);
            }
        });

        // -------------------------------------------------------------
        // 4. COMPAÑÍAS SELECCIONADAS (Ballroom, Cia, etc)
        // -------------------------------------------------------------
        let reporteCompanias = [];
        if (companiasSeleccionadas.length > 0) {
            const { data: companiasDB } = await supabase.from('companias').select('id, nombre').in('id', companiasSeleccionadas);

            for (const cia of (companiasDB || [])) {
                const { data: pagosCia } = await supabase.from('companias_pagos')
                    .select('monto, alumno_id')
                    .eq('mes', mes).eq('anio', anio).eq('compania_id', cia.id)
                    .limit(10000);

                const recaudoCia = pagosCia?.reduce((a, b) => a + Number(b.monto), 0) || 0;
                const partCia = new Set(pagosCia?.map(p => p.alumno_id)).size;

                const { data: clasesCia } = await supabase.from('clases')
                    .select('id, valor_acuerdo, tipo_acuerdo, inscripciones(valor_credito)')
                    .eq('compania_id', cia.id)
                    .gte('inicio', startDate)
                    .lte('inicio', endDate)
                    .limit(10000);

                let pagoProfesCia = 0;
                clasesCia?.forEach((clase: any) => {
                    const acuerdo = Number(clase.valor_acuerdo) || 0;
                    if (clase.tipo_acuerdo === 'fijo') pagoProfesCia += acuerdo;
                    else {
                        const recaudoClase = clase.inscripciones?.reduce((acc: number, cur: any) => acc + (Number(cur.valor_credito) || 0), 0) || 0;
                        pagoProfesCia += recaudoClase * (acuerdo / 100);
                    }
                });

                reporteCompanias.push({
                    nombre: cia.nombre,
                    participantes: partCia,
                    inscriptos: statsCompanias[cia.id]?.inscriptos || 0,
                    tomadas: statsCompanias[cia.id]?.tomadas || 0,
                    recaudacion: recaudoCia,
                    pago_docentes: pagoProfesCia
                });
            }
        }

        // -------------------------------------------------------------
        // 5. HORAS RECEPCIÓN
        // -------------------------------------------------------------
        const { data: turnosRecep } = await supabase.from('caja_turnos')
            .select('fecha_apertura, fecha_cierre, usuario:profiles(nombre_completo)')
            .gte('fecha_apertura', startDate)
            .lte('fecha_apertura', endDate)
            .not('fecha_cierre', 'is', null)
            .limit(10000);

        const horasRecepcion: Record<string, number> = {};
        turnosRecep?.forEach((turno: any) => {
            const nom = Array.isArray(turno.usuario) ? turno.usuario[0]?.nombre_completo : turno.usuario?.nombre_completo;
            const nombre = nom || 'Desconocido';
            const horas = (new Date(turno.fecha_cierre).getTime() - new Date(turno.fecha_apertura).getTime()) / (1000 * 60 * 60);
            if (!horasRecepcion[nombre]) horasRecepcion[nombre] = 0;
            horasRecepcion[nombre] += horas;
        });

        // -------------------------------------------------------------
        // 6. RECAUDACIÓN POR SEDE
        // -------------------------------------------------------------
        const { data: movsSedes } = await supabase.from('caja_movimientos')
            .select('monto, caja_turnos!inner(sede:sedes(nombre))')
            .eq('tipo', 'ingreso')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .limit(10000);

        const recaudacionSedes: Record<string, number> = {};
        movsSedes?.forEach((mov: any) => {
            const nombreSede = Array.isArray(mov.caja_turnos?.sede) ? mov.caja_turnos.sede[0]?.nombre : mov.caja_turnos?.sede?.nombre;
            const sede = nombreSede || 'Desconocida';
            if (!recaudacionSedes[sede]) recaudacionSedes[sede] = 0;
            recaudacionSedes[sede] += Number(mov.monto);
        });

        return {
            success: true,
            data: {
                packs: reportePacks,
                inscriptos: { regulares: inscriptosRegulares, especiales: inscriptosEspeciales },
                tomadas: { regulares: tomadasRegulares, especiales: tomadasEspeciales },
                liga: {
                    participantes: participantesLiga,
                    recaudacion: recaudacionLiga,
                    pago_docentes: pagoProfesLiga,
                    inscriptos: inscriptosLiga,
                    tomadas: tomadasLiga
                },
                companias: reporteCompanias,
                horasRecep: Object.entries(horasRecepcion).map(([nombre, horas]) => ({ nombre, horas })),
                sedes: Object.entries(recaudacionSedes).map(([nombre, monto]) => ({ nombre, monto }))
            }
        };

    } catch (error: any) {
        console.error("Error al generar reporte:", error);
        return { success: false, error: error.message }
    }
}