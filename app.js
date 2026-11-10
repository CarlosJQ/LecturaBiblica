/**
 * Mi Lectura Bíblica Diaria v2.2
 * Aplicación para seguir un plan de lectura bíblica con 5 bloques
 * Con checkboxes para marcar lecturas completadas y calendario
 */

// ===== DATOS DE LA BIBLIA =====
const BIBLIA = [
    // Bloque 1: Génesis - Cantares (incluye Salmos y Proverbios)
    { nombre: "Genesis", nombreEs: "Génesis", capitulos: 50 },
    { nombre: "Exodus", nombreEs: "Éxodo", capitulos: 40 },
    { nombre: "Leviticus", nombreEs: "Levítico", capitulos: 27 },
    { nombre: "Numbers", nombreEs: "Números", capitulos: 36 },
    { nombre: "Deuteronomy", nombreEs: "Deuteronomio", capitulos: 34 },
    { nombre: "Joshua", nombreEs: "Josué", capitulos: 24 },
    { nombre: "Judges", nombreEs: "Jueces", capitulos: 21 },
    { nombre: "Ruth", nombreEs: "Rut", capitulos: 4 },
    { nombre: "1 Samuel", nombreEs: "1 Samuel", capitulos: 31 },
    { nombre: "2 Samuel", nombreEs: "2 Samuel", capitulos: 24 },
    { nombre: "1 Kings", nombreEs: "1 Reyes", capitulos: 22 },
    { nombre: "2 Kings", nombreEs: "2 Reyes", capitulos: 25 },
    { nombre: "1 Chronicles", nombreEs: "1 Crónicas", capitulos: 29 },
    { nombre: "2 Chronicles", nombreEs: "2 Crónicas", capitulos: 36 },
    { nombre: "Ezra", nombreEs: "Esdras", capitulos: 10 },
    { nombre: "Nehemiah", nombreEs: "Nehemías", capitulos: 13 },
    { nombre: "Esther", nombreEs: "Ester", capitulos: 10 },
    { nombre: "Job", nombreEs: "Job", capitulos: 42 },
    { nombre: "Psalms", nombreEs: "Salmos", capitulos: 150 },
    { nombre: "Proverbs", nombreEs: "Proverbios", capitulos: 31 },
    { nombre: "Ecclesiastes", nombreEs: "Eclesiastés", capitulos: 12 },
    { nombre: "Song of Solomon", nombreEs: "Cantares", capitulos: 8 },

    // Bloque 5 (nuevo): Isaías - Daniel
    { nombre: "Isaiah", nombreEs: "Isaías", capitulos: 66 },
    { nombre: "Jeremiah", nombreEs: "Jeremías", capitulos: 52 },
    { nombre: "Lamentations", nombreEs: "Lamentaciones", capitulos: 5 },
    { nombre: "Ezekiel", nombreEs: "Ezequiel", capitulos: 48 },
    { nombre: "Daniel", nombreEs: "Daniel", capitulos: 12 },

    // Bloque 2: Oseas - Malaquías
    { nombre: "Hosea", nombreEs: "Oseas", capitulos: 14 },
    { nombre: "Joel", nombreEs: "Joel", capitulos: 3 },
    { nombre: "Amos", nombreEs: "Amós", capitulos: 9 },
    { nombre: "Obadiah", nombreEs: "Abdías", capitulos: 1 },
    { nombre: "Jonah", nombreEs: "Jonás", capitulos: 4 },
    { nombre: "Micah", nombreEs: "Miqueas", capitulos: 7 },
    { nombre: "Nahum", nombreEs: "Nahúm", capitulos: 3 },
    { nombre: "Habakkuk", nombreEs: "Habacuc", capitulos: 3 },
    { nombre: "Zephaniah", nombreEs: "Sofonías", capitulos: 3 },
    { nombre: "Haggai", nombreEs: "Hageo", capitulos: 2 },
    { nombre: "Zechariah", nombreEs: "Zacarías", capitulos: 14 },
    { nombre: "Malachi", nombreEs: "Malaquías", capitulos: 4 },

    // Bloque 3: Mateo - Juan
    { nombre: "Matt", nombreEs: "Mateo", capitulos: 28 },
    { nombre: "Mark", nombreEs: "Marcos", capitulos: 16 },
    { nombre: "Luke", nombreEs: "Lucas", capitulos: 24 },
    { nombre: "John", nombreEs: "Juan", capitulos: 21 },

    // Bloque 4: Hechos - Apocalipsis
    { nombre: "Acts", nombreEs: "Hechos", capitulos: 28 },
    { nombre: "Romans", nombreEs: "Romanos", capitulos: 16 },
    { nombre: "1 Corinthians", nombreEs: "1 Corintios", capitulos: 16 },
    { nombre: "2 Corinthians", nombreEs: "2 Corintios", capitulos: 13 },
    { nombre: "Galatians", nombreEs: "Gálatas", capitulos: 6 },
    { nombre: "Ephesians", nombreEs: "Efesios", capitulos: 6 },
    { nombre: "Philippians", nombreEs: "Filipenses", capitulos: 4 },
    { nombre: "Colossians", nombreEs: "Colosenses", capitulos: 4 },
    { nombre: "1 Thessalonians", nombreEs: "1 Tesalonicenses", capitulos: 5 },
    { nombre: "2 Thessalonians", nombreEs: "2 Tesalonicenses", capitulos: 3 },
    { nombre: "1 Timothy", nombreEs: "1 Timoteo", capitulos: 6 },
    { nombre: "2 Timothy", nombreEs: "2 Timoteo", capitulos: 4 },
    { nombre: "Titus", nombreEs: "Tito", capitulos: 3 },
    { nombre: "Philemon", nombreEs: "Filemón", capitulos: 1 },
    { nombre: "Hebrews", nombreEs: "Hebreos", capitulos: 13 },
    { nombre: "James", nombreEs: "Santiago", capitulos: 5 },
    { nombre: "1 Peter", nombreEs: "1 Pedro", capitulos: 5 },
    { nombre: "2 Peter", nombreEs: "2 Pedro", capitulos: 3 },
    { nombre: "1 John", nombreEs: "1 Juan", capitulos: 5 },
    { nombre: "2 John", nombreEs: "2 Juan", capitulos: 1 },
    { nombre: "3 John", nombreEs: "3 Juan", capitulos: 1 },
    { nombre: "Jude", nombreEs: "Judas", capitulos: 1 },
    { nombre: "Revelation", nombreEs: "Apocalipsis", capitulos: 22 }
];

// ===== CONFIGURACIÓN DE BLOQUES =====
// Bloque 1: Génesis - Cantares = 699 capítulos (índices 0-21)
// Bloque 5: Isaías - Daniel = 183 capítulos (índices 22-26)
// Bloque 2: Oseas - Malaquías = 67 capítulos (índices 27-38)
// Bloque 3: Mateo - Juan = 89 capítulos (índices 39-42)
// Bloque 4: Hechos - Apocalipsis = 171 capítulos (índices 43-65)

const BLOQUES = [
    {
        id: 1,
        nombre: "Bloque 1",
        descripcion: "Génesis - Cantares",
        librosInicio: 0,   // Génesis
        librosFin: 21,     // Cantares
        capitulosPorDia: 2,
        tipo: 'cicloPorMeses',
        mesesInicio: [0],  // Solo Enero
        repeticionesAnuales: 1
    },
    {
        id: 2,
        nombre: "Bloque 2",
        descripcion: "Oseas - Malaquías",
        librosInicio: 27,  // Oseas
        librosFin: 38,     // Malaquías
        capitulosPorDia: 1,
        tipo: 'continuo',
        mesesInicio: [0],
        repeticionesAnuales: 5
    },
    {
        id: 3,
        nombre: "Bloque 3",
        descripcion: "Mateo - Juan",
        librosInicio: 39,  // Mateo
        librosFin: 42,     // Juan
        capitulosPorDia: 1,
        tipo: 'cicloConPausa',
        mesesInicio: [0, 3, 6, 9], // Ene, Abr, Jul, Oct
        repeticionesAnuales: 4
    },
    {
        id: 4,
        nombre: "Bloque 4",
        descripcion: "Hechos - Apocalipsis",
        librosInicio: 43,  // Hechos
        librosFin: 65,     // Apocalipsis
        capitulosPorDia: 1,
        tipo: 'cicloConPausa',
        mesesInicio: [0, 6], // Ene, Jul
        repeticionesAnuales: 2
    },
    {
        id: 5,
        nombre: "Bloque 5",
        descripcion: "Isaías - Daniel",
        librosInicio: 22,  // Isaías
        librosFin: 26,     // Daniel
        capitulosPorDia: 1,
        tipo: 'cicloConPausa',
        mesesInicio: [0, 6], // Ene, Jul (2 rondas al año)
        repeticionesAnuales: 2
    }
];

// ===== ALMACENAMIENTO LOCAL =====
const STORAGE_KEY = 'lecturaBiblica_completadas';

function getCompletadas() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
}

function setCompletada(fecha, bloqueId, completada) {
    const completadas = getCompletadas();
    const key = `${fecha}_${bloqueId}`;
    if (completada) {
        completadas[key] = true;
    } else {
        delete completadas[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completadas));
}

function isCompletada(fecha, bloqueId) {
    const completadas = getCompletadas();
    const key = `${fecha}_${bloqueId}`;
    return !!completadas[key];
}

// ===== FUNCIONES AUXILIARES =====

function getTotalCapitulosBloque(bloque) {
    let total = 0;
    for (let i = bloque.librosInicio; i <= bloque.librosFin; i++) {
        total += BIBLIA[i].capitulos;
    }
    return total;
}

function getDiasDesdeInicioAño(fecha) {
    const inicioAño = new Date(fecha.getFullYear(), 0, 1);
    const diff = fecha.getTime() - inicioAño.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getFechaInicioCiclo(fecha, bloque) {
    if (bloque.tipo === 'continuo') {
        return new Date(fecha.getFullYear(), 0, 1);
    }

    const año = fecha.getFullYear();
    const mes = fecha.getMonth();

    let mesInicioCiclo = -1;
    for (const mesInicio of bloque.mesesInicio) {
        if (mesInicio <= mes) {
            mesInicioCiclo = mesInicio;
        }
    }

    if (mesInicioCiclo === -1) {
        mesInicioCiclo = bloque.mesesInicio[bloque.mesesInicio.length - 1];
        return new Date(año - 1, mesInicioCiclo, 1);
    }

    return new Date(año, mesInicioCiclo, 1);
}

function getDiasEnCiclo(fecha, bloque) {
    if (bloque.tipo === 'continuo') {
        return getDiasDesdeInicioAño(fecha);
    }

    const fechaInicio = getFechaInicioCiclo(fecha, bloque);
    const diffTime = fecha.getTime() - fechaInicio.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getReferenciaCapitulo(bloque, capituloGlobal) {
    const totalCapitulos = getTotalCapitulosBloque(bloque);

    let capituloActual = capituloGlobal % totalCapitulos;
    if (capituloActual < 0) capituloActual += totalCapitulos;

    let capitulosAcumulados = 0;
    for (let i = bloque.librosInicio; i <= bloque.librosFin; i++) {
        const libro = BIBLIA[i];
        if (capituloActual < capitulosAcumulados + libro.capitulos) {
            const capitulo = capituloActual - capitulosAcumulados + 1;
            return {
                libro: libro.nombreEs,
                capitulo: capitulo,
                referencia: `${libro.nombreEs} ${capitulo}`
            };
        }
        capitulosAcumulados += libro.capitulos;
    }

    return { libro: "", capitulo: 0, referencia: "Error" };
}

/**
 * Verifica si un bloque con pausa debe mostrar lectura ese día
 * Retorna null si el bloque está en pausa
 */
function getLecturaConPausa(bloque, fecha) {
    const diasEnCiclo = getDiasEnCiclo(fecha, bloque);
    const totalCapitulos = getTotalCapitulosBloque(bloque);
    const capituloInicial = diasEnCiclo * bloque.capitulosPorDia;

    if (capituloInicial >= totalCapitulos) {
        return null;
    }

    const referencias = [];
    for (let i = 0; i < bloque.capitulosPorDia; i++) {
        const capIndex = capituloInicial + i;
        if (capIndex < totalCapitulos) {
            const ref = getReferenciaCapitulo(bloque, capIndex);
            referencias.push(ref);
        }
    }

    if (referencias.length === 0) return null;

    return agruparReferencias(referencias);
}

function getLecturasDelDia(fecha) {
    const lecturas = [];

    for (const bloque of BLOQUES) {
        // Bloques con pausa (3, 4 y 5)
        if (bloque.tipo === 'cicloConPausa') {
            const refsPausa = getLecturaConPausa(bloque, fecha);
            if (refsPausa === null) {
                continue;
            }

            lecturas.push({
                bloqueId: bloque.id,
                bloqueNombre: bloque.nombre,
                bloqueDescripcion: bloque.descripcion,
                referencias: refsPausa,
                textoCompleto: refsPausa.join(", ")
            });
            continue;
        }

        // Bloques normales (1 y 2)
        const diasEnCiclo = getDiasEnCiclo(fecha, bloque);
        const capituloInicial = diasEnCiclo * bloque.capitulosPorDia;

        const referencias = [];
        for (let i = 0; i < bloque.capitulosPorDia; i++) {
            const ref = getReferenciaCapitulo(bloque, capituloInicial + i);
            referencias.push(ref);
        }

        const referenciasAgrupadas = agruparReferencias(referencias);

        lecturas.push({
            bloqueId: bloque.id,
            bloqueNombre: bloque.nombre,
            bloqueDescripcion: bloque.descripcion,
            referencias: referenciasAgrupadas,
            textoCompleto: referenciasAgrupadas.join(", ")
        });
    }

    return lecturas;
}

function agruparReferencias(referencias) {
    if (referencias.length === 0) return [];
    if (referencias.length === 1) return [referencias[0].referencia];

    const resultado = [];
    let libroActual = referencias[0].libro;
    let capituloInicio = referencias[0].capitulo;
    let capituloFin = referencias[0].capitulo;

    for (let i = 1; i < referencias.length; i++) {
        const ref = referencias[i];

        if (ref.libro === libroActual && ref.capitulo === capituloFin + 1) {
            capituloFin = ref.capitulo;
        } else {
            if (capituloInicio === capituloFin) {
                resultado.push(`${libroActual} ${capituloInicio}`);
            } else {
                resultado.push(`${libroActual} ${capituloInicio}-${capituloFin}`);
            }

            libroActual = ref.libro;
            capituloInicio = ref.capitulo;
            capituloFin = ref.capitulo;
        }
    }

    if (capituloInicio === capituloFin) {
        resultado.push(`${libroActual} ${capituloInicio}`);
    } else {
        resultado.push(`${libroActual} ${capituloInicio}-${capituloFin}`);
    }

    return resultado;
}

function formatearFecha(fecha) {
    const opciones = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    return fecha.toLocaleDateString('es-ES', opciones);
}

function formatearFechaISO(fecha) {
    // Fecha local (no UTC), para que el día no cambie según la zona horaria
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function getNombreDiaRelativo(offset, fechaSeleccionada) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const diffDias = Math.round((fechaSeleccionada - hoy) / (1000 * 60 * 60 * 24));

    switch (diffDias) {
        case -1: return "Ayer";
        case 0: return "Hoy";
        case 1: return "Mañana";
        case 2: return "Pasado Mañana";
        default: return diffDias > 0 ? `En ${diffDias} días` : `Hace ${-diffDias} días`;
    }
}

// ===== ESTADO DE LA APLICACIÓN =====
let fechaSeleccionada = new Date();
fechaSeleccionada.setHours(0, 0, 0, 0);

// ===== RENDERIZADO DE LA UI =====

function crearTarjetaDia(fecha) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const lecturas = getLecturasDelDia(fecha);
    const esHoy = fecha.getTime() === hoy.getTime();
    const fechaStr = formatearFechaISO(fecha);
    const nombreDia = getNombreDiaRelativo(0, fecha);

    const card = document.createElement('div');
    card.className = `day-card${esHoy ? ' today' : ''}`;

    const readingsHTML = lecturas.map(lectura => {
        const completada = isCompletada(fechaStr, lectura.bloqueId);
        return `
            <div class="reading-item ${completada ? 'completed' : ''}">
                <label class="checkbox-container">
                    <input type="checkbox" 
                           data-fecha="${fechaStr}" 
                           data-bloque="${lectura.bloqueId}"
                           ${completada ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
                <div class="block-indicator block-${lectura.bloqueId}"></div>
                <div class="reading-content">
                    <div class="reading-reference">${lectura.textoCompleto}</div>
                    <div class="reading-block-name">${lectura.bloqueDescripcion}</div>
                </div>
            </div>
        `;
    }).join('');

    card.innerHTML = `
        <div class="day-header">
            <div class="day-name">${nombreDia}</div>
            <div class="day-date">${formatearFecha(fecha)}</div>
        </div>
        <div class="readings-list">
            ${readingsHTML}
        </div>
    `;

    card.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const fechaData = e.target.dataset.fecha;
            const bloqueId = parseInt(e.target.dataset.bloque);
            setCompletada(fechaData, bloqueId, e.target.checked);

            const item = e.target.closest('.reading-item');
            if (e.target.checked) {
                item.classList.add('completed');
            } else {
                item.classList.remove('completed');
            }

            actualizarProgresoCalendario();
        });
    });

    return card;
}

function renderizarLecturas() {
    const container = document.querySelector('.readings-container');
    container.innerHTML = '';

    const tarjeta = crearTarjetaDia(fechaSeleccionada);
    container.appendChild(tarjeta);
}

function actualizarFechaHeader() {
    const fechaElement = document.getElementById('current-date');
    fechaElement.textContent = formatearFecha(new Date());
}

// ===== CALENDARIO =====

function generarCalendario() {
    const container = document.getElementById('calendar-container');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const dias = [];
    for (let i = -7; i <= 7; i++) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() + i);
        dias.push(fecha);
    }

    container.innerHTML = dias.map(fecha => {
        const fechaStr = formatearFechaISO(fecha);
        const esHoy = fecha.getTime() === hoy.getTime();
        const esSeleccionado = fecha.getTime() === fechaSeleccionada.getTime();
        const lecturas = getLecturasDelDia(fecha);
        const progreso = calcularProgresoDia(fecha);

        let clases = 'calendar-day';
        if (esHoy) clases += ' is-today';
        if (esSeleccionado) clases += ' selected';
        if (progreso.completadas === progreso.total && progreso.total > 0) clases += ' all-complete';
        else if (progreso.completadas > 0) clases += ' partial-complete';

        return `
            <button class="${clases}" data-fecha="${fechaStr}">
                <span class="day-number">${fecha.getDate()}</span>
                <span class="day-name-short">${fecha.toLocaleDateString('es-ES', { weekday: 'short' }).substring(0, 2)}</span>
                ${progreso.completadas > 0 ? `<span class="progress-indicator">${progreso.completadas}/${progreso.total}</span>` : ''}
            </button>
        `;
    }).join('');

    container.querySelectorAll('.calendar-day').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const fechaStr = e.currentTarget.dataset.fecha;
            fechaSeleccionada = new Date(fechaStr + 'T00:00:00');
            renderizarLecturas();
            actualizarCalendarioSeleccion();
        });
    });
}

function actualizarCalendarioSeleccion() {
    document.querySelectorAll('.calendar-day').forEach(btn => {
        const fechaStr = btn.dataset.fecha;
        const fecha = new Date(fechaStr + 'T00:00:00');
        btn.classList.toggle('selected', fecha.getTime() === fechaSeleccionada.getTime());
    });
}

function actualizarProgresoCalendario() {
    document.querySelectorAll('.calendar-day').forEach(btn => {
        const fechaStr = btn.dataset.fecha;
        const fecha = new Date(fechaStr + 'T00:00:00');
        const progreso = calcularProgresoDia(fecha);

        btn.classList.remove('all-complete', 'partial-complete');
        if (progreso.completadas === progreso.total && progreso.total > 0) btn.classList.add('all-complete');
        else if (progreso.completadas > 0) btn.classList.add('partial-complete');

        let indicador = btn.querySelector('.progress-indicator');
        if (progreso.completadas > 0) {
            if (!indicador) {
                indicador = document.createElement('span');
                indicador.className = 'progress-indicator';
                btn.appendChild(indicador);
            }
            indicador.textContent = `${progreso.completadas}/${progreso.total}`;
        } else if (indicador) {
            indicador.remove();
        }
    });
}

function calcularProgresoDia(fecha) {
    const fechaStr = formatearFechaISO(fecha);
    const lecturas = getLecturasDelDia(fecha);
    let completadas = 0;

    for (const lectura of lecturas) {
        if (isCompletada(fechaStr, lectura.bloqueId)) completadas++;
    }

    return { completadas, total: lecturas.length };
}

// ===== NAVEGACIÓN DE FECHA =====

function irAHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fechaSeleccionada = hoy;
    generarCalendario();
    renderizarLecturas();
}

function cambiarDia(offset) {
    fechaSeleccionada.setDate(fechaSeleccionada.getDate() + offset);
    generarCalendario();
    renderizarLecturas();
}

// ===== RESPALDO (EXPORTAR / IMPORTAR) =====

const CLAVE_VALIDA = /^\d{4}-\d{2}-\d{2}_\d+$/;

function crearTextoRespaldo() {
    return JSON.stringify({
        app: 'lecturaBiblica',
        version: 1,
        exportado: new Date().toISOString(),
        completadas: getCompletadas()
    });
}

function mostrarEstadoRespaldo(mensaje, esError) {
    const estado = document.getElementById('backup-status');
    estado.textContent = mensaje;
    estado.classList.toggle('error', !!esError);
}

function actualizarInfoRespaldo() {
    const total = Object.keys(getCompletadas()).length;
    document.getElementById('backup-info').textContent =
        `Tienes ${total} ${total === 1 ? 'lectura marcada' : 'lecturas marcadas'} en este dispositivo.`;
}

async function exportarArchivo() {
    const texto = crearTextoRespaldo();
    const nombre = `lectura-biblica-${formatearFechaISO(new Date())}.json`;

    // En iPhone: abre la hoja de compartir (Guardar en Archivos, AirDrop, etc.)
    try {
        const archivo = new File([texto], nombre, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
            await navigator.share({ files: [archivo], title: 'Respaldo Lectura Bíblica' });
            mostrarEstadoRespaldo('Respaldo compartido.');
            return;
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return; // el usuario canceló
    }

    // En computadora: descarga directa
    try {
        const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        mostrarEstadoRespaldo(`Archivo ${nombre} guardado.`);
    } catch (e) {
        mostrarEstadoRespaldo('No se pudo guardar el archivo. Usa "Copiar como texto".', true);
    }
}

async function exportarTexto() {
    const texto = crearTextoRespaldo();
    const caja = document.getElementById('backup-text');
    caja.value = texto;

    try {
        await navigator.clipboard.writeText(texto);
        mostrarEstadoRespaldo('Respaldo copiado. Pégalo en Notas o donde quieras guardarlo.');
    } catch (e) {
        // Sin acceso al portapapeles: se deja el texto seleccionado para copiarlo a mano
        caja.focus();
        caja.select();
        mostrarEstadoRespaldo('El respaldo está en el cuadro de arriba: selecciónalo todo y cópialo.');
    }
}

function importarRespaldo(texto) {
    let datos;
    try {
        datos = JSON.parse(texto.trim());
    } catch (e) {
        mostrarEstadoRespaldo('Ese texto no es un respaldo válido.', true);
        return;
    }

    const origen = datos && typeof datos === 'object' && datos.completadas ? datos.completadas : datos;
    if (!origen || typeof origen !== 'object' || Array.isArray(origen)) {
        mostrarEstadoRespaldo('Ese texto no es un respaldo válido.', true);
        return;
    }

    const claves = Object.keys(origen).filter(clave => CLAVE_VALIDA.test(clave) && origen[clave]);
    if (claves.length === 0) {
        mostrarEstadoRespaldo('El respaldo no contiene lecturas marcadas.', true);
        return;
    }

    // Se suma a lo que ya hay: nunca borra marcas existentes
    const completadas = getCompletadas();
    let nuevas = 0;
    for (const clave of claves) {
        if (!completadas[clave]) nuevas++;
        completadas[clave] = true;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completadas));

    document.getElementById('backup-text').value = '';
    actualizarInfoRespaldo();
    generarCalendario();
    renderizarLecturas();
    mostrarEstadoRespaldo(`Listo: el respaldo tenía ${claves.length} lectura(s); se agregaron ${nuevas} nueva(s).`);
}

function iniciarRespaldo() {
    actualizarInfoRespaldo();
    document.getElementById('backup-section').addEventListener('toggle', actualizarInfoRespaldo);
    document.getElementById('btn-export-file').addEventListener('click', exportarArchivo);
    document.getElementById('btn-export-copy').addEventListener('click', exportarTexto);

    document.getElementById('btn-import-text').addEventListener('click', () => {
        const texto = document.getElementById('backup-text').value;
        if (!texto.trim()) {
            mostrarEstadoRespaldo('Primero pega el texto del respaldo en el cuadro.', true);
            return;
        }
        importarRespaldo(texto);
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
        const archivo = e.target.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => importarRespaldo(String(lector.result));
        lector.onerror = () => mostrarEstadoRespaldo('No se pudo leer el archivo.', true);
        lector.readAsText(archivo);
        e.target.value = '';
    });
}

// ===== INICIALIZACIÓN =====

// Permite abrir la app sin conexión cuando está instalada (no aplica dentro de Koder)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    actualizarFechaHeader();
    generarCalendario();
    renderizarLecturas();
    iniciarRespaldo();

    document.getElementById('btn-prev').addEventListener('click', () => cambiarDia(-1));
    document.getElementById('btn-next').addEventListener('click', () => cambiarDia(1));
    document.getElementById('btn-today').addEventListener('click', irAHoy);

    // Log de verificación
    console.log('=== Verificación de Bloques v2.2 ===');
    BLOQUES.forEach(bloque => {
        const total = getTotalCapitulosBloque(bloque);
        const dias = Math.ceil(total / bloque.capitulosPorDia);
        console.log(`${bloque.nombre} (${bloque.descripcion}): ${total} caps, ${dias} días`);
    });
});
