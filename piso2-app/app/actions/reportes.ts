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
            .lte('fecha_compra', endDate);

        const reportePacks = {
            regular: { sueltas: 0, x4: 0, x8: 0, x12: 0, otros: 0, total_vendidos: 0 },
            especial: { sueltas: 0, x4: 0, x8: 0, x12: 0, otros: 0, total_vendidos: 0 }
        }

        packs?.forEach(pack => {
            const esEspecial = pack.tipo_clase === 'seminario' || pack.tipo_clase?.toLowerCase() === 'especial';
            const cat = esEspecial ? 'especial' : 'regular'; // Exclusivo y Regular van a 'regular'
            const cant = pack.cantidad_inicial;

            reportePacks[cat].total_vendidos++;
            if (cant === 1) reportePacks[cat].sueltas++;
            else if (cant === 4) reportePacks[cat].x4++;
            else if (cant === 8) reportePacks[cat].x8++;
            else if (cant === 12) reportePacks[cat].x12++;
            else reportePacks[cat].otros++;
        });

        // -------------------------------------------------------------
        // 2. CLASES TOMADAS (Asistencias Reales)
        // -------------------------------------------------------------
        // Usamos inner join para traer solo inscripciones de clases de este mes
        const { data: tomadas } = await supabase.from('inscripciones')
            .select('estado_asistencia, clase:clases!inner(tipo_clase, inicio)')
            .gte('clases.inicio', startDate)
            .lte('clases.inicio', endDate)
            .eq('estado_asistencia', 'presente');

        let tomadasRegulares = 0;
        let tomadasEspeciales = 0;

        tomadas?.forEach((insc: any) => {
            const tipo = insc.clase?.tipo_clase?.toLowerCase() || '';
            if (tipo === 'especial' || tipo === 'seminario') tomadasEspeciales++;
            else tomadasRegulares++;
        });

        // -------------------------------------------------------------
        // 3. LA LIGA (Participantes, Recaudación, Profesores)
        // -------------------------------------------------------------
        const { data: pagosLiga } = await supabase.from('liga_pagos')
            .select('monto, alumno_id')
            .eq('mes', mes).eq('anio', anio);

        const recaudacionLiga = pagosLiga?.reduce((a, b) => a + Number(b.monto), 0) || 0;
        const participantesLiga = new Set(pagosLiga?.map(p => p.alumno_id)).size;

        const { data: clasesLiga } = await supabase.from('clases')
            .select('id, valor_acuerdo, tipo_acuerdo, inscripciones(valor_credito)')
            .eq('es_la_liga', true)
            .gte('inicio', startDate)
            .lte('inicio', endDate);

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
                // Pagos
                const { data: pagosCia } = await supabase.from('companias_pagos')
                    .select('monto, alumno_id')
                    .eq('mes', mes).eq('anio', anio).eq('compania_id', cia.id);

                const recaudoCia = pagosCia?.reduce((a, b) => a + Number(b.monto), 0) || 0;
                const partCia = new Set(pagosCia?.map(p => p.alumno_id)).size;

                // Profes
                const { data: clasesCia } = await supabase.from('clases')
                    .select('id, valor_acuerdo, tipo_acuerdo, inscripciones(valor_credito)')
                    .eq('compania_id', cia.id)
                    .gte('inicio', startDate)
                    .lte('inicio', endDate);

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
            .not('fecha_cierre', 'is', null);

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
            .lte('created_at', endDate);

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
                tomadas: { regulares: tomadasRegulares, especiales: tomadasEspeciales },
                liga: { participantes: participantesLiga, recaudacion: recaudacionLiga, pago_docentes: pagoProfesLiga },
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