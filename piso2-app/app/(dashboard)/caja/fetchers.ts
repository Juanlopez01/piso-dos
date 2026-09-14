import { createClient } from '@/utils/supabase/client'

export type CajaData = {
    admin: {
        cajasActivas: any[]
        historialCajas: any[]
        reporteHoras: any[]
    } | null
    recepcion: {
        sedes: any[]
        turnoActivo: any | null
        movimientos: any[]
        ultimosCierresPorSede: Record<string, any>
    } | null
    pagosOnline: any[]
    turnosDisponibles: any[]
}

export const fetcherCaja = async ([key, role, uid, mesSeleccionado]: [string, string, string, string?]): Promise<CajaData> => {
    const supabase = createClient()

    const { data: turnosAbiertosData } = await supabase
        .from('caja_turnos')
        .select(`id, sede:sedes(id, nombre)`)
        .eq('estado', 'abierta');

    const turnosDisponibles = (turnosAbiertosData || []).map((t: any) => ({
        id: t.id,
        sede_nombre: Array.isArray(t.sede) ? t.sede[0]?.nombre : t.sede?.nombre
    }));

    const { data: pagosOnlineData, error: errPagos } = await supabase
        .from('pagos_online')
        .select('*')
        .eq('estado', 'approved')
        .order('created_at', { ascending: false })
        .limit(100)

    if (errPagos) console.error("Error leyendo pagos online:", errPagos)

    let pagosOnline = pagosOnlineData || []

    if (pagosOnline.length > 0) {
        const userIds = [...new Set(pagosOnline.map((p: any) => p.user_id).filter(Boolean))]

        if (userIds.length > 0) {
            const { data: perfiles } = await supabase
                .from('profiles')
                .select('id, nombre_completo')
                .in('id', userIds)

            pagosOnline = pagosOnline.map((pago: any) => ({
                ...pago,
                usuario: perfiles?.find((prof: any) => prof.id === pago.user_id) || { nombre_completo: 'Usuario Desconocido' }
            }))
        }
    }

    if (role === 'admin') {
        const { data: activas } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo), caja_movimientos(*)`)
            .eq('estado', 'abierta')

        let activasCalculadas = []
        if (activas) {
            activasCalculadas = activas.map((caja: any) => {
                const montoInicial = Number(caja.monto_inicial) || 0
                const ingresosMovs = caja.caja_movimientos?.filter((m: any) => m.tipo === 'ingreso').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const egresos = caja.caja_movimientos?.filter((m: any) => m.tipo === 'egreso').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const ingresosEfecMovs = caja.caja_movimientos?.filter((m: any) => m.tipo === 'ingreso' && m.metodo_pago === 'efectivo').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0
                const egresosEfec = caja.caja_movimientos?.filter((m: any) => m.tipo === 'egreso' && m.metodo_pago === 'efectivo').reduce((a: any, b: any) => a + Number(b.monto), 0) || 0

                return {
                    ...caja,
                    ingresos_movimientos: ingresosMovs,
                    total_ingresos_vista: montoInicial + ingresosMovs,
                    saldo_total: montoInicial + ingresosMovs - egresos,
                    saldo_fisico: montoInicial + ingresosEfecMovs - egresosEfec
                }
            })
        }

        const { data: historial } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('estado', 'cerrada')
            .order('fecha_cierre', { ascending: false })
            .limit(100)

        const historialCalculado = (historial || []).map((caja: any) => ({
            ...caja,
            ingresos_con_inicial: Number(caja.total_ingresos) + Number(caja.monto_inicial)
        }))

        // --- LÓGICA DE FILTRO POR MES ---
        let fechaInicioMes: string;
        let fechaFinMes: string;

        if (mesSeleccionado) {
            const [year, month] = mesSeleccionado.split('-');
            fechaInicioMes = new Date(Number(year), Number(month) - 1, 1).toISOString();
            fechaFinMes = new Date(Number(year), Number(month), 1).toISOString();
        } else {
            const hoy = new Date();
            fechaInicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
            fechaFinMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
        }

        const { data: turnosMes } = await supabase.from('caja_turnos')
            .select(`usuario_id, fecha_apertura, fecha_cierre, usuario:profiles(nombre_completo)`)
            .gte('fecha_apertura', fechaInicioMes)
            .lt('fecha_apertura', fechaFinMes)
            .not('fecha_cierre', 'is', null)

        const horasPorRecepcionista: Record<string, any> = {}

        if (turnosMes) {
            turnosMes.forEach((turno: any) => {
                if (!turno.fecha_apertura || !turno.fecha_cierre) return;

                const apertura = new Date(turno.fecha_apertura).getTime();
                const cierre = new Date(turno.fecha_cierre).getTime();
                const diffHoras = (cierre - apertura) / (1000 * 60 * 60);
                const uid = turno.usuario_id;

                if (!horasPorRecepcionista[uid]) {
                    const nombreUsuario = Array.isArray(turno.usuario) ? turno.usuario[0]?.nombre_completo : turno.usuario?.nombre_completo;
                    horasPorRecepcionista[uid] = {
                        nombre: nombreUsuario || 'Usuario Desconocido',
                        horas: 0,
                        cantidad_turnos: 0
                    };
                }

                horasPorRecepcionista[uid].horas += diffHoras;
                horasPorRecepcionista[uid].cantidad_turnos += 1;
            })
        }

        const reporteHoras = Object.values(horasPorRecepcionista).sort((a: any, b: any) => b.horas - a.horas);

        return { admin: { cajasActivas: activasCalculadas, historialCajas: historialCalculado, reporteHoras }, recepcion: null, pagosOnline, turnosDisponibles }

    } else if (role === 'recepcion' || role === 'auxiliar') {
        if (!uid) throw new Error("No user ID")

        const { data: sedes } = await supabase.from('sedes').select('*').order('nombre')

        const { data: turnoActivo } = await supabase.from('caja_turnos')
            .select(`*, sede:sedes(nombre), usuario:profiles(nombre_completo)`)
            .eq('usuario_id', uid)
            .eq('estado', 'abierta')
            .maybeSingle()

        let movimientos: any[] = []
        if (turnoActivo) {
            const { data: movs } = await supabase.from('caja_movimientos')
                .select('*')
                .eq('turno_id', turnoActivo.id)
                .order('created_at', { ascending: false })
            movimientos = movs || []
        }

        const ultimosCierresPorSede: Record<string, any> = {};
        if (sedes) {
            for (const sede of sedes) {
                const { data: ultimoTurno } = await supabase.from('caja_turnos')
                    .select('monto_final, usuario:profiles(nombre_completo), fecha_cierre')
                    .eq('sede_id', sede.id)
                    .eq('estado', 'cerrada')
                    .order('fecha_cierre', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (ultimoTurno) {
                    ultimosCierresPorSede[sede.id] = {
                        monto: ultimoTurno.monto_final,
                        responsable: Array.isArray(ultimoTurno.usuario) ? ultimoTurno.usuario[0]?.nombre_completo : ultimoTurno.usuario?.nombre_completo,
                        fecha: ultimoTurno.fecha_cierre
                    };
                }
            }
        }

        return { admin: null, recepcion: { sedes: sedes || [], turnoActivo, movimientos, ultimosCierresPorSede }, pagosOnline, turnosDisponibles }
    }

    return { admin: null, recepcion: null, pagosOnline: [], turnosDisponibles: [] }
}

export const fetcherDetalle = async ([key, turnoId]: [string, string]) => {
    const supabase = createClient()
    const { data } = await supabase.from('caja_movimientos')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false })
    return data || []
}

export const formatHoras = (horasDecimales: number) => {
    const h = Math.floor(horasDecimales);
    const m = Math.round((horasDecimales - h) * 60);
    return `${h}h ${m}m`;
}
