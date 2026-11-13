/**
 * Lectura de libros: un libro por día de la semana, avance por capítulos,
 * páginas, versículos o sermones, con historial de lo leído.
 * Usa utilidades de app.js (esc, sumarDias, formatearFechaISO).
 */

const LIBROS_KEY = 'lecturaBiblica_libros';
const VISTA_KEY = 'lecturaBiblica_vista';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const UNIDADES = {
    'capítulo': ['cap.', 'caps.', 'capítulos'],
    'página': ['pág.', 'págs.', 'páginas'],
    'versículo': ['v.', 'vv.', 'versículos'],
    'sermón': ['sermón', 'sermones', 'sermones'],
    'sección': ['sección', 'secciones', 'secciones']
};
const ESTADOS = [['leyendo', 'Leyendo'], ['pendiente', 'Pendientes'], ['terminado', 'Terminados']];

let librosCache = null;
let filtroBiblioteca = 'leyendo';
let busquedaBiblioteca = '';
let panelLibro = null; // { modo: 'lectura' | 'editar', id: número o null (libro nuevo) }
let mensajeLibro = '';
let semanaOffset = 0;        // semana que se está viendo (0 = esta, 1 = la próxima…)
let diaOffset = 0;           // día que se está viendo en las lecturas diarias (0 = hoy)

const MOMENTOS = [['mañana', '🌅 Mañana'], ['noche', '🌙 Noche']];

// ===== Datos =====

const EQUIPO_KEY = 'lecturaBiblica_equipo';
let equipoCache = null;
let ultimoId = 0;

// Identificadores únicos aunque se creen cosas en dos equipos a la vez
function nuevoId() {
    const id = Math.max(ultimoId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000));
    ultimoId = id;
    return id;
}

// Este equipo: sirve para saber en cuál quedó guardado cada audio
function getEquipo() {
    if (equipoCache) return equipoCache;
    try {
        equipoCache = JSON.parse(localStorage.getItem(EQUIPO_KEY));
    } catch (e) { }
    if (!equipoCache || !equipoCache.id) {
        const ua = navigator.userAgent || '';
        let nombre = 'Equipo';
        if (/iPhone/.test(ua)) nombre = 'iPhone';
        else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) nombre = 'iPad';
        else if (/Macintosh/.test(ua)) nombre = 'Mac';
        equipoCache = { id: Math.random().toString(36).slice(2, 10), nombre };
        try {
            localStorage.setItem(EQUIPO_KEY, JSON.stringify(equipoCache));
        } catch (e) { }
    }
    return equipoCache;
}

function getDatosLibros() {
    if (librosCache) return librosCache;
    let datos = null;
    try {
        const crudo = localStorage.getItem(LIBROS_KEY);
        datos = crudo ? JSON.parse(crudo) : null;
    } catch (e) { }
    if (!datos || !Array.isArray(datos.libros) || !Array.isArray(datos.registro)) {
        datos = { version: 1, nextId: 1, libros: [], registro: [] };
    }
    if (!Array.isArray(datos.notas)) datos.notas = [];
    // Audios grabados antes de que existiera la sincronización: son de este equipo
    datos.notas.forEach(nota => {
        if (nota.audio && !nota.audio.equipo) {
            nota.audio.equipo = getEquipo().id;
            nota.audio.equipoNombre = getEquipo().nombre;
        }
    });
    if (!datos.nextId) {
        datos.nextId = Math.max(0, ...datos.libros.map(l => l.id), ...datos.registro.map(r => r.id),
            ...datos.notas.map(n => n.id)) + 1;
    }
    librosCache = datos;
    return datos;
}

function guardarDatosLibros() {
    localStorage.setItem(LIBROS_KEY, JSON.stringify(getDatosLibros()));
    notificarCambioLocal();
}

function libroPorId(id) {
    return getDatosLibros().libros.find(libro => libro.id === id);
}

function entero(valor, porDefecto) {
    const n = Math.floor(Number(valor));
    return Number.isFinite(n) && n >= 1 ? n : porDefecto;
}

function normalizarLibro(libro) {
    const diario = !!libro.diario;
    return {
        ...libro, // conserva campos que esta versión no conozca (por si vienen de un equipo más nuevo)
        id: libro.id,
        titulo: String(libro.titulo || '').trim(),
        autor: String(libro.autor || '').trim(),
        estado: ESTADOS.some(e => e[0] === libro.estado) ? libro.estado : 'pendiente',
        dia: !diario && entero(libro.dia, null) && libro.dia <= 7 ? Number(libro.dia) : null,
        diario,                                                       // se lee todos los días
        momento: diario && ['mañana', 'noche'].includes(libro.momento) ? libro.momento : '',
        orden: entero(libro.orden, 1),                                // lugar en la cola de su momento
        variable: !!libro.variable,                                   // el avance se define cada vez
        unidad: UNIDADES[libro.unidad] ? libro.unidad : 'capítulo',
        total: entero(libro.total, null),
        paginas: entero(libro.paginas, null),
        ritmo: entero(libro.ritmo, 1),
        siguiente: entero(libro.siguiente, 1),
        aMedias: !!libro.aMedias,
        detalle: String(libro.detalle || '').trim()
    };
}

function claveLibro(libro) {
    return `${libro.titulo}|${libro.autor}`.toLowerCase();
}

// Agrega los libros de un respaldo que aquí no existen (mismo título y autor = ya existe)
function importarLibros(entrada) {
    if (!entrada || !Array.isArray(entrada.libros)) return 0;
    const datos = getDatosLibros();
    const existentes = new Set(datos.libros.map(claveLibro));
    const nuevosIds = new Map();
    let agregados = 0;

    for (const original of entrada.libros) {
        const libro = normalizarLibro(original || {});
        if (!libro.titulo || existentes.has(claveLibro(libro))) continue;
        existentes.add(claveLibro(libro));
        libro.id = nuevoId();
        nuevosIds.set(original.id, libro.id);
        datos.libros.push(libro);
        agregados++;
    }

    for (const r of Array.isArray(entrada.registro) ? entrada.registro : []) {
        if (!r || !nuevosIds.has(r.libroId) || !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) continue;
        datos.registro.push({
            id: nuevoId(),
            libroId: nuevosIds.get(r.libroId),
            fecha: r.fecha,
            desde: entero(r.desde, 1),
            hasta: entero(r.hasta, entero(r.desde, 1)),
            completo: r.completo !== false,
            nota: String(r.nota || ''),
            ...(/^\d{4}-\d{2}-\d{2}$/.test(r.para || '') ? { para: r.para } : {})
        });
    }

    // Notas de los libros nuevos. Los audios no viajan en el respaldo: queda solo el texto.
    for (const n of Array.isArray(entrada.notas) ? entrada.notas : []) {
        if (!n || !nuevosIds.has(n.libroId) || !/^\d{4}-\d{2}-\d{2}$/.test(n.fecha)) continue;
        const texto = String(n.texto || '').trim();
        if (!texto && !n.audio) continue;
        datos.notas.push({
            id: nuevoId(),
            libroId: nuevosIds.get(n.libroId),
            fecha: n.fecha,
            ref: String(n.ref || ''),
            texto: texto || '(audio que no venía en el respaldo)',
            audio: null
        });
    }

    if (agregados > 0) {
        guardarDatosLibros();
        renderizarLibros();
    }
    return agregados;
}

// ===== Textos =====

function textoTramo(libro, desde, hasta) {
    const [singular, plural] = UNIDADES[libro.unidad] || UNIDADES['capítulo'];
    return desde === hasta ? `${singular} ${desde}` : `${plural} ${desde}-${hasta}`;
}

function tramoSiguiente(libro) {
    const tope = libro.total || Infinity;
    const desde = libro.siguiente;
    const hasta = Math.max(desde, Math.min(tope, desde + libro.ritmo - 1));
    return { desde, hasta };
}

function textoToca(libro) {
    const { desde, hasta } = tramoSiguiente(libro);
    let texto = textoTramo(libro, desde, hasta);
    if (libro.aMedias) {
        texto += ' (continuar)';
        // Recuerda hasta dónde se llegó: la nota de la última lectura que quedó a medias
        const ultima = getDatosLibros().registro
            .filter(r => r.libroId === libro.id && !r.completo && r.nota)
            .sort((a, b) => b.id - a.id)[0];
        if (ultima) texto += ` · ${ultima.nota}`;
    }
    if (libro.detalle) texto += ` · ${libro.detalle}`;
    return texto;
}

function textoRegistro(libro, r) {
    return textoTramo(libro, r.desde, r.hasta) + (r.completo ? '' : ' (a medias)');
}

function textoAvance(libro) {
    const partes = [];
    if (libro.total) {
        const hechos = Math.min(libro.total, libro.siguiente - 1);
        const plural = (UNIDADES[libro.unidad] || UNIDADES['capítulo'])[2];
        partes.push(`${Math.round(hechos / libro.total * 100)}% · ${hechos} de ${libro.total} ${plural}`);
    }
    if (libro.paginas && libro.unidad !== 'página') partes.push(`${libro.paginas} páginas`);
    return partes.join(' · ');
}

function lunesDe(fecha) {
    return sumarDias(fecha, -((fecha.getDay() + 6) % 7));
}

function hoySinHora() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return hoy;
}

// ===== Periodos y proyección =====
// Cada lectura pertenece a un "periodo": una semana (libros semanales) o un día (libros diarios).
// Normalmente es el de su fecha, pero se puede adelantar la de un periodo futuro.

function periodoDe(libro, fecha) {
    return formatearFechaISO(libro.diario ? fecha : lunesDe(fecha));
}

function periodoDeRegistro(libro, r) {
    return r.para || periodoDe(libro, new Date(r.fecha + 'T00:00:00'));
}

function registrosDePeriodo(libro, iso) {
    return getDatosLibros().registro.filter(r => r.libroId === libro.id && periodoDeRegistro(libro, r) === iso);
}

function textoLeido(libro, leidos) {
    const desde = Math.min(...leidos.map(r => r.desde));
    const hasta = Math.max(...leidos.map(r => r.hasta));
    const aMedias = leidos.some(r => !r.completo && r.hasta === hasta);
    return textoTramo(libro, desde, hasta) + (aMedias ? ' (a medias)' : '');
}

// Sesiones que le quedan a un libro (infinitas si no se sabe el total)
function sesionesRestantes(libro) {
    if (!libro.total) return Infinity;
    return Math.max(0, Math.ceil((libro.total - libro.siguiente + 1) / libro.ritmo));
}

// Qué tocará después de "saltos" sesiones todavía pendientes.
// Devuelve { desde, hasta }, { porDefinir: true } o { terminado: true }.
function proyectar(libro, saltos) {
    if (saltos === 0) return tramoSiguiente(libro);
    if (libro.variable) return { porDefinir: true };
    const desde = libro.aMedias
        ? libro.siguiente + 1 + libro.ritmo * (saltos - 1)
        : libro.siguiente + libro.ritmo * saltos;
    if (libro.total && desde > libro.total) return { terminado: true };
    return { desde, hasta: Math.min(libro.total || Infinity, desde + libro.ritmo - 1) };
}

function textoProyeccion(libro, p) {
    if (p.porDefinir) return 'Por definir';
    if (p.terminado) return 'Para entonces ya lo habrás terminado';
    return textoTramo(libro, p.desde, p.hasta);
}

function itemLibroHTML(libro, estadoHTML, para, proyeccion) {
    const datosTramo = proyeccion && proyeccion.desde ? ` data-desde="${proyeccion.desde}" data-hasta="${proyeccion.hasta}"` : '';
    return `
        <button type="button" class="lib-item" data-libro="${libro.id}" data-para="${para}"${datosTramo}>
            <span class="lib-titulo">${esc(libro.titulo)}${indicadorFotos(libro.id)}${indicadorNotas(libro.id)}</span>
            <span class="lib-autor">${esc(libro.autor)}</span>
            ${estadoHTML}
        </button>`;
}

// ===== Vista principal =====

function navHTML(tipo, titulo, enHoy) {
    return `
        <div class="lib-nav">
            <button type="button" class="nav-btn" data-nav="${tipo}" data-paso="-1" aria-label="Anterior">‹</button>
            <span class="lib-nav-titulo">${titulo}</span>
            <button type="button" class="nav-btn" data-nav="${tipo}" data-paso="1" aria-label="Siguiente">›</button>
            ${enHoy ? '' : `<button type="button" class="nav-btn today-btn" data-nav="${tipo}" data-paso="0">Hoy</button>`}
        </div>`;
}

function semanaHTML() {
    const datos = getDatosLibros();
    const hoy = hoySinHora();
    const lunesActual = lunesDe(hoy);
    const lunes = sumarDias(lunesActual, semanaOffset * 7);
    const domingo = sumarDias(lunes, 6);
    const isoSemana = formatearFechaISO(lunes);
    const activos = datos.libros.filter(l => l.estado === 'leyendo' && l.dia && !l.diario);

    const rango = `${lunes.getDate()}${lunes.getMonth() === domingo.getMonth() ? '' : ' de ' + lunes.toLocaleDateString('es-ES', { month: 'long' })}` +
        ` al ${domingo.getDate()} de ${domingo.toLocaleDateString('es-ES', { month: 'long' })}`;
    const nombres = { '-1': 'Semana pasada', '0': 'Esta semana', '1': 'Próxima semana' };
    const nombre = nombres[semanaOffset] ||
        (semanaOffset > 0 ? `En ${semanaOffset} semanas` : `Hace ${-semanaOffset} semanas`);

    let filas = '';
    for (let d = 0; d < 7; d++) {
        const fecha = sumarDias(lunes, d);
        const esHoy = fecha.getTime() === hoy.getTime();

        const items = activos.filter(l => l.dia === d + 1).map(libro => {
            const leidos = registrosDePeriodo(libro, isoSemana);
            if (leidos.length > 0) {
                return itemLibroHTML(libro, `<span class="lib-toca leido">✓ Leído: ${esc(textoLeido(libro, leidos))}</span>`, isoSemana);
            }
            if (semanaOffset < 0) {
                return itemLibroHTML(libro, '<span class="lib-toca falto">No se registró lectura</span>', isoSemana);
            }
            if (semanaOffset === 0) {
                return itemLibroHTML(libro, `<span class="lib-toca">Toca: ${esc(textoToca(libro))}</span>`, isoSemana);
            }
            // Semana futura: avanza un tramo por cada semana anterior aún sin leer
            let saltos = 0;
            for (let j = 0; j < semanaOffset; j++) {
                if (registrosDePeriodo(libro, formatearFechaISO(sumarDias(lunesActual, j * 7))).length === 0) saltos++;
            }
            const p = proyectar(libro, saltos);
            return itemLibroHTML(libro, `<span class="lib-toca futuro">Tocará: ${esc(textoProyeccion(libro, p))}</span>`, isoSemana, p);
        }).join('');

        filas += `
            <div class="lib-dia ${esHoy ? 'hoy' : ''}">
                <div class="lib-dia-nombre">${DIAS_SEMANA[d].slice(0, 3)}<span>${fecha.getDate()}</span></div>
                <div class="lib-dia-cuerpo">${items || '<span class="lib-vacio">Sin libro asignado</span>'}</div>
            </div>`;
    }

    return `
        <section class="lib-card" data-desliza="semana">
            <h2>Lecturas semanales</h2>
            ${navHTML('semana', `<strong>${nombre}</strong><br>${rango}`, semanaOffset === 0)}
            ${filas}
            <p class="cfg-hint">Desliza hacia los lados para ver otras semanas. Toca un libro para marcarlo, aunque sea de una semana futura.</p>
        </section>`;
}

// ----- Lecturas diarias -----

// Una "ranura" es un momento del día con su cola de libros (se leen uno tras otro)
function ranurasDiarias() {
    const diarios = getDatosLibros().libros
        .filter(l => l.estado === 'leyendo' && l.diario)
        .sort((a, b) => a.orden - b.orden || a.id - b.id);
    const ranuras = MOMENTOS.map(([clave, nombre]) => ({ clave, nombre, libros: diarios.filter(l => l.momento === clave) }));
    diarios.filter(l => !l.momento).forEach(libro => ranuras.push({ clave: `libro-${libro.id}`, nombre: '📖 Cada día', libros: [libro] }));
    return ranuras;
}

// Todos los libros diarios de ese momento, incluidos los ya terminados
// (lo leído en un libro que se terminó también cuenta como "día leído")
function librosDelMomento(ranura) {
    return getDatosLibros().libros.filter(l => l.diario &&
        (ranura.libros.includes(l) || (l.momento && l.momento === ranura.clave)));
}

function ranuraLeida(ranura, iso) {
    return librosDelMomento(ranura).some(libro => registrosDePeriodo(libro, iso).length > 0);
}

// Qué libro y qué tramo tocan en la ranura después de "saltos" días pendientes
function proyectarRanura(ranura, saltos) {
    let pendientes = saltos;
    for (const libro of ranura.libros) {
        const sesiones = sesionesRestantes(libro);
        if (pendientes < sesiones) return { libro, p: proyectar(libro, pendientes) };
        pendientes -= sesiones;
    }
    return null;
}

function rachaDeRanura(ranura, hoy) {
    const leido = fecha => ranuraLeida(ranura, formatearFechaISO(fecha));
    let dia = leido(hoy) ? hoy : sumarDias(hoy, -1);
    let racha = 0;
    while (racha < 400 && leido(dia)) {
        racha++;
        dia = sumarDias(dia, -1);
    }
    const ultimos = [];
    for (let i = 6; i >= 0; i--) ultimos.push(leido(sumarDias(hoy, -i)));
    return { racha, ultimos };
}

function pronosticoRanura(ranura, hoy) {
    if (ranura.libros.length === 0) return '';
    let dias = ranuraLeida(ranura, formatearFechaISO(hoy)) ? 1 : 0; // hoy ya cuenta o no
    const partes = [];
    for (const libro of ranura.libros) {
        const sesiones = sesionesRestantes(libro);
        if (!Number.isFinite(sesiones)) {
            partes.push(`${libro.titulo}: sin total, no se puede calcular`);
            return partes.join(' · ');
        }
        dias += sesiones;
        const fin = sumarDias(hoy, dias - 1);
        partes.push(`${libro.titulo} termina el ${fin.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`);
    }
    const finAño = new Date(hoy.getFullYear(), 11, 31);
    const sobran = Math.round((finAño - sumarDias(hoy, dias - 1)) / 86400000);
    let texto = `Sin saltarte días: ${partes.join(' · ')}.`;
    if (sobran > 0) texto += ` Después ${sobran === 1 ? 'queda 1 día' : `quedan ${sobran} días`} hasta fin de año para otro libro.`;
    else if (sobran < 0) texto += ` Se pasa ${-sobran} ${sobran === -1 ? 'día' : 'días'} de fin de año.`;
    return texto;
}

function diariasHTML() {
    const hoy = hoySinHora();
    const fecha = sumarDias(hoy, diaOffset);
    const iso = formatearFechaISO(fecha);
    const nombres = { '-1': 'Ayer', '0': 'Hoy', '1': 'Mañana' };
    const nombre = nombres[diaOffset] || (diaOffset > 0 ? `En ${diaOffset} días` : `Hace ${-diaOffset} días`);
    const fechaTexto = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    const bloques = ranurasDiarias().map(ranura => {
        let cuerpo = '';
        const leidos = ranura.libros
            .map(libro => ({ libro, leidos: registrosDePeriodo(libro, iso) }))
            .filter(x => x.leidos.length > 0);
        // También lo leído ese día en libros de este momento que ya se terminaron
        getDatosLibros().libros
            .filter(l => l.diario && l.estado === 'terminado' && l.momento && l.momento === ranura.clave)
            .forEach(libro => {
                const r = registrosDePeriodo(libro, iso);
                if (r.length > 0) leidos.push({ libro, leidos: r });
            });

        if (leidos.length > 0) {
            cuerpo = leidos.map(x => itemLibroHTML(x.libro,
                `<span class="lib-toca leido">✓ Leído: ${esc(textoLeido(x.libro, x.leidos))}</span>`, iso)).join('');
        } else if (ranura.libros.length === 0) {
            cuerpo = '<span class="lib-vacio">Sin libro. Abre uno de tu biblioteca y en "Cuándo lo leo" elige este momento.</span>';
        } else if (diaOffset < 0) {
            cuerpo = '<span class="lib-toca falto">No se registró lectura</span>';
        } else {
            let saltos = 0;
            for (let j = 0; j < diaOffset; j++) {
                if (!ranuraLeida(ranura, formatearFechaISO(sumarDias(hoy, j)))) saltos++;
            }
            const proyeccion = proyectarRanura(ranura, saltos);
            if (!proyeccion) {
                cuerpo = '<span class="lib-vacio">Para ese día ya habrás terminado la cola: agrega otro libro a este momento.</span>';
            } else {
                const { libro, p } = proyeccion;
                const texto = diaOffset === 0 && libro === ranura.libros[0]
                    ? `Toca: ${esc(textoToca(libro))}`
                    : `Tocará: ${esc(textoProyeccion(libro, p))}`;
                cuerpo = itemLibroHTML(libro, `<span class="lib-toca ${diaOffset === 0 ? '' : 'futuro'}">${texto}</span>`, iso, p);
            }
        }

        const { racha, ultimos } = rachaDeRanura(ranura, hoy);
        const puntos = ultimos.map(ok => `<span class="racha-punto ${ok ? 'ok' : ''}"></span>`).join('');
        const cola = ranura.libros.slice(1).map(l => l.titulo).join(', ');
        const pronostico = diaOffset === 0 ? pronosticoRanura(ranura, hoy) : '';

        return `
            <div class="diaria">
                <div class="diaria-cabecera">
                    <span class="diaria-nombre">${ranura.nombre}</span>
                    <span class="racha" title="Últimos 7 días">${puntos}${racha > 0 ? ` <strong>${racha}</strong> ${racha === 1 ? 'día seguido' : 'días seguidos'}` : ''}</span>
                </div>
                ${cuerpo}
                ${cola ? `<p class="cfg-hint">Después: ${esc(cola)}</p>` : ''}
                ${pronostico ? `<p class="cfg-hint">${esc(pronostico)}</p>` : ''}
            </div>`;
    }).join('');

    return `
        <section class="lib-card" data-desliza="dia">
            <h2>Lecturas diarias</h2>
            ${navHTML('dia', `<strong>${nombre}</strong><br>${fechaTexto}`, diaOffset === 0)}
            ${bloques}
        </section>`;
}

function textoCuando(libro) {
    if (libro.diario) return libro.momento ? `Cada día (${libro.momento})` : 'Cada día';
    return libro.dia ? DIAS_SEMANA[libro.dia - 1] : '';
}

function listaBibliotecaHTML() {
    const datos = getDatosLibros();
    const texto = busquedaBiblioteca.trim().toLowerCase();
    const libros = datos.libros
        .filter(l => l.estado === filtroBiblioteca)
        .filter(l => !texto || `${l.titulo} ${l.autor}`.toLowerCase().includes(texto))
        .sort((a, b) => (a.diario ? 8 : (a.dia || 9)) - (b.diario ? 8 : (b.dia || 9)) || a.orden - b.orden || a.autor.localeCompare(b.autor, 'es') || a.titulo.localeCompare(b.titulo, 'es'));

    if (libros.length === 0) {
        return `<p class="lib-vacio">${texto ? 'Ningún libro coincide con la búsqueda.' : 'No hay libros en esta lista.'}</p>`;
    }

    return libros.map(libro => {
        const detalles = [];
        if (libro.estado === 'leyendo') {
            if (textoCuando(libro)) detalles.push(textoCuando(libro));
            detalles.push(`toca ${textoToca(libro)}`);
        }
        const avance = textoAvance(libro);
        if (avance) detalles.push(avance);
        return `
            <button type="button" class="lib-item" data-libro="${libro.id}">
                <span class="lib-titulo">${esc(libro.titulo)}${indicadorFotos(libro.id)}${indicadorNotas(libro.id)}</span>
                <span class="lib-autor">${esc(libro.autor)}</span>
                ${detalles.length ? `<span class="lib-toca">${esc(detalles.join(' · '))}</span>` : ''}
            </button>`;
    }).join('');
}

function bibliotecaHTML() {
    const datos = getDatosLibros();
    const chips = ESTADOS.map(([valor, nombre]) => {
        const cantidad = datos.libros.filter(l => l.estado === valor).length;
        return `<button type="button" class="cfg-chip ${filtroBiblioteca === valor ? 'on' : ''}" data-filtro="${valor}">${nombre} (${cantidad})</button>`;
    }).join('');

    return `
        <section class="lib-card">
            <div class="lib-head">
                <h2>Mi biblioteca</h2>
                <button type="button" class="backup-btn" data-acc="nuevo">＋ Agregar libro</button>
            </div>
            <div class="cfg-chips lib-filtros">${chips}</div>
            <input type="search" id="lib-buscar" class="lib-buscar" placeholder="Buscar por título o autor"
                value="${esc(busquedaBiblioteca)}" aria-label="Buscar libro">
            <div id="lib-lista">${listaBibliotecaHTML()}</div>
        </section>`;
}

function renderizarLibros() {
    const vista = document.getElementById('vista-libros');
    if (!vista) return;
    vista.innerHTML = diariasHTML() + semanaHTML() + bibliotecaHTML();
}

// ===== Ficha del libro =====

function campoHTML(etiqueta, contenido) {
    return `<label>${etiqueta}${contenido}</label>`;
}

function panelLecturaHTML(libro) {
    const datos = getDatosLibros();
    const { desde, hasta } = panelLibro.tramo || tramoSiguiente(libro);
    const nombreUnidad = (UNIDADES[libro.unidad] || UNIDADES['capítulo'])[2];
    // Si se abrió desde otra semana u otro día, la lectura se anota para ese periodo
    let destino = '';
    if (panelLibro.para && panelLibro.para !== periodoDe(libro, hoySinHora())) {
        const inicio = new Date(panelLibro.para + 'T00:00:00');
        destino = libro.diario
            ? `Se anotará para el ${inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`
            : `Se anotará para la semana del ${inicio.getDate()} al ${sumarDias(inicio, 6).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`;
    }
    const historial = datos.registro
        .filter(r => r.libroId === libro.id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

    const filas = historial.slice(0, 30).map(r => {
        const fecha = new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        return `
            <li>
                <span><strong>${esc(textoRegistro(libro, r))}</strong> · ${fecha}${r.nota ? `<br><em>${esc(r.nota)}</em>` : ''}</span>
                <button type="button" class="cfg-del" data-borrar-registro="${r.id}" aria-label="Borrar esta lectura">✕</button>
            </li>`;
    }).join('');

    const avance = textoAvance(libro);

    return `
        <p class="lib-ficha-autor">${esc(libro.autor)}${textoCuando(libro) ? ` · ${textoCuando(libro)}` : ''}</p>
        ${avance ? `<p class="cfg-hint">${esc(avance)}</p>` : ''}

        <div class="cfg-sec">
            <p class="lib-ficha-toca">Toca: ${esc(textoToca(libro))}</p>
            ${destino ? `<p class="lib-destino">${destino}</p>` : ''}
            <div class="lib-form dos">
                ${campoHTML(`Leí desde (${nombreUnidad})`, `<input type="number" id="lec-desde" inputmode="numeric" min="1" value="${desde}">`)}
                ${campoHTML('Hasta', `<input type="number" id="lec-hasta" inputmode="numeric" min="1" value="${hasta}">`)}
            </div>
            <label class="lib-check"><input type="checkbox" id="lec-medias">
                <span>Lo último quedó a medias (lo continúo la próxima vez)</span></label>
            <div class="lib-form">
                ${campoHTML('Fecha', `<input type="date" id="lec-fecha" value="${formatearFechaISO(new Date())}">`)}
                ${campoHTML('Nota (opcional)', '<input type="text" id="lec-nota" maxlength="200" placeholder="Ej.: llegué hasta la pág. 581">')}
            </div>
            <button type="button" class="cfg-save lib-ancho" data-acc="guardar-lectura">✓ Marcar como leído</button>
        </div>

        <p class="backup-status" role="status" aria-live="polite">${esc(mensajeLibro)}</p>

        <div class="cfg-sec" id="fotos-seccion"></div>

        <div class="cfg-sec" id="notas-seccion"></div>

        <div class="cfg-sec">
            <h3 class="lib-h3">Historial</h3>
            ${filas ? `<ul class="lib-historial">${filas}</ul>` : '<p class="lib-vacio">Todavía no hay lecturas registradas.</p>'}
        </div>

        <button type="button" class="backup-btn lib-ancho" data-acc="editar">Editar datos del libro</button>
    `;
}

function panelEditarHTML(libro) {
    const l = libro || normalizarLibro({ estado: 'leyendo' });
    const dias = [['', 'Sin día fijo'], ...DIAS_SEMANA.map((nombre, i) => [i + 1, `Cada ${nombre.toLowerCase()}`]),
        ['m', 'Cada día, en la mañana'], ['n', 'Cada día, en la noche'], ['d', 'Cada día']];
    const cuando = l.diario ? (l.momento === 'mañana' ? 'm' : (l.momento === 'noche' ? 'n' : 'd')) : l.dia;
    const unidades = Object.keys(UNIDADES).map(u => [u, u.charAt(0).toUpperCase() + u.slice(1) + 's']);
    const estados = [['leyendo', 'Leyendo'], ['pendiente', 'Pendiente'], ['terminado', 'Terminado']];
    const opciones = (lista, actual) => lista.map(([v, t]) =>
        `<option value="${v}" ${String(v) === String(actual ?? '') ? 'selected' : ''}>${t}</option>`).join('');

    return `
        <div class="cfg-sec">
            <div class="lib-form">
                ${campoHTML('Título', `<input type="text" id="ed-titulo" maxlength="120" value="${esc(l.titulo)}">`)}
                ${campoHTML('Autor', `<input type="text" id="ed-autor" maxlength="80" value="${esc(l.autor)}">`)}
            </div>
            <div class="lib-form dos">
                ${campoHTML('Estado', `<select id="ed-estado">${opciones(estados, l.estado)}</select>`)}
                ${campoHTML('Cuándo lo leo', `<select id="ed-dia">${opciones(dias, cuando)}</select>`)}
                ${campoHTML('Avanzo por', `<select id="ed-unidad">${opciones(unidades, l.unidad)}</select>`)}
                ${campoHTML('Cuántos por vez', `<input type="number" id="ed-ritmo" inputmode="numeric" min="1" value="${l.ritmo}">`)}
                ${campoHTML('Lo próximo que toca', `<input type="number" id="ed-siguiente" inputmode="numeric" min="1" value="${l.siguiente}">`)}
                ${campoHTML('Total (si lo sabes)', `<input type="number" id="ed-total" inputmode="numeric" min="1" value="${l.total || ''}">`)}
                ${campoHTML('Páginas del libro', `<input type="number" id="ed-paginas" inputmode="numeric" min="1" value="${l.paginas || ''}">`)}
                ${campoHTML('Orden en la cola diaria', `<input type="number" id="ed-orden" inputmode="numeric" min="1" value="${l.orden}">`)}
            </div>
            <div class="lib-form">
                ${campoHTML('Detalle de dónde voy (opcional)', `<input type="text" id="ed-detalle" maxlength="120" value="${esc(l.detalle)}" placeholder="Ej.: Romanos 6">`)}
            </div>
            <label class="lib-check"><input type="checkbox" id="ed-medias" ${l.aMedias ? 'checked' : ''}>
                <span>Lo próximo ya está empezado (quedó a medias)</span></label>
            <label class="lib-check"><input type="checkbox" id="ed-variable" ${l.variable ? 'checked' : ''}>
                <span>El avance varía: lo defino cada vez (no adelantar semanas futuras)</span></label>
            <p class="cfg-hint">"Total" permite calcular cuándo terminas. Si varios libros comparten la mañana o la noche,
                se leen uno tras otro según el orden en la cola.</p>
        </div>
        <p class="backup-status error" role="status" aria-live="polite">${esc(mensajeLibro)}</p>
        <div class="cfg-actions">
            <button type="button" class="cfg-save" data-acc="guardar-libro">Guardar</button>
            ${libro ? '<button type="button" class="backup-btn" data-acc="eliminar-libro">Eliminar libro</button>' : ''}
        </div>
    `;
}

function renderizarPanelLibro() {
    const libro = panelLibro.id ? libroPorId(panelLibro.id) : null;
    document.getElementById('libro-panel-titulo').textContent = libro ? libro.titulo : 'Nuevo libro';
    document.getElementById('libro-body').innerHTML =
        panelLibro.modo === 'lectura' && libro ? panelLecturaHTML(libro) : panelEditarHTML(libro);
    if (panelLibro.modo === 'lectura' && libro) {
        renderizarFotos(libro.id);
        renderizarNotas(libro.id);
    }
}

function abrirPanelLibro(id, contexto) {
    const libro = id ? libroPorId(id) : null;
    panelLibro = {
        modo: libro && libro.estado === 'leyendo' ? 'lectura' : 'editar',
        id: libro ? libro.id : null,
        para: contexto && contexto.para ? contexto.para : null,     // periodo al que se anotará la lectura
        tramo: contexto && contexto.tramo ? contexto.tramo : null   // tramo sugerido para ese periodo
    };
    mensajeLibro = '';
    renderizarPanelLibro();
    const panel = document.getElementById('libro-panel');
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('config-abierto');
}

function cerrarPanelLibro() {
    alCerrarFichaNotas();
    document.getElementById('libro-panel').hidden = true;
    document.body.classList.remove('config-abierto');
    panelLibro = null;
    renderizarLibros();
}

// ===== Acciones =====

function guardarLectura(libro) {
    const desde = entero(document.getElementById('lec-desde').value, null);
    const hasta = entero(document.getElementById('lec-hasta').value, null);
    const fecha = document.getElementById('lec-fecha').value;
    const aMedias = document.getElementById('lec-medias').checked;

    if (!desde || !hasta || hasta < desde || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        mensajeLibro = 'Revisa los números: "hasta" no puede ser menor que "desde", y la fecha debe estar completa.';
        return false;
    }

    const datos = getDatosLibros();
    const registro = {
        id: nuevoId(),
        libroId: libro.id,
        fecha,
        desde,
        hasta,
        completo: !aMedias,
        nota: document.getElementById('lec-nota').value.trim()
    };
    // Lectura adelantada (o atrasada): se anota para el periodo desde el que se abrió
    if (panelLibro.para && panelLibro.para !== periodoDe(libro, new Date(fecha + 'T00:00:00'))) {
        registro.para = panelLibro.para;
    }
    datos.registro.push(registro);
    panelLibro.tramo = null;

    // El libro avanza solo si esta lectura llega más lejos de donde iba
    const nuevoSiguiente = aMedias ? hasta : hasta + 1;
    if (nuevoSiguiente > libro.siguiente || (aMedias && hasta >= libro.siguiente)) {
        libro.siguiente = nuevoSiguiente;
        libro.aMedias = aMedias;
    } else if (!aMedias && libro.aMedias && hasta >= libro.siguiente) {
        libro.aMedias = false;
    }
    mensajeLibro = `Guardado: ${textoTramo(libro, desde, hasta)}${aMedias ? ' (a medias)' : ''}.`;

    if (libro.total && libro.siguiente > libro.total) {
        libro.estado = 'terminado';
        libro.siguiente = libro.total + 1;
        mensajeLibro += ' ¡Terminaste el libro! Pasó a "Terminados".';
    }
    guardarDatosLibros();
    return true;
}

function borrarRegistro(libro, idRegistro) {
    const datos = getDatosLibros();
    const registro = datos.registro.find(r => r.id === idRegistro);
    if (!registro || !confirm(`¿Borrar la lectura "${textoRegistro(libro, registro)}" del historial?`)) return;

    const delLibro = datos.registro.filter(r => r.libroId === libro.id);
    const esLaUltima = delLibro.every(r => r.id <= registro.id);
    datos.registro = datos.registro.filter(r => r.id !== idRegistro);

    // Si era la última lectura anotada, el libro vuelve a donde estaba antes de ella
    if (esLaUltima) {
        libro.siguiente = registro.desde;
        libro.aMedias = false;
    }
    mensajeLibro = 'Lectura borrada del historial.';
    guardarDatosLibros();
}

function guardarLibro() {
    const valor = id => document.getElementById(id).value;
    const datos = getDatosLibros();
    const existente = panelLibro.id ? libroPorId(panelLibro.id) : null;

    const cuando = valor('ed-dia');
    const esDiario = ['m', 'n', 'd'].includes(cuando);
    const libro = normalizarLibro({
        ...(existente || {}),
        id: existente ? existente.id : null,
        titulo: valor('ed-titulo'),
        autor: valor('ed-autor'),
        estado: valor('ed-estado'),
        dia: esDiario ? null : cuando,
        diario: esDiario,
        momento: cuando === 'm' ? 'mañana' : (cuando === 'n' ? 'noche' : ''),
        orden: valor('ed-orden'),
        variable: document.getElementById('ed-variable').checked,
        unidad: valor('ed-unidad'),
        ritmo: valor('ed-ritmo'),
        siguiente: valor('ed-siguiente'),
        total: valor('ed-total'),
        paginas: valor('ed-paginas'),
        detalle: valor('ed-detalle'),
        aMedias: document.getElementById('ed-medias').checked
    });

    if (!libro.titulo) {
        mensajeLibro = 'Escribe el título del libro.';
        return false;
    }

    if (existente) {
        Object.assign(existente, libro);
    } else {
        libro.id = nuevoId();
        datos.libros.push(libro);
    }
    filtroBiblioteca = libro.estado;
    guardarDatosLibros();
    return true;
}

function alHacerClicPanelLibro(e) {
    const libro = panelLibro && panelLibro.id ? libroPorId(panelLibro.id) : null;
    const borrar = e.target.closest('[data-borrar-registro]');
    const boton = e.target.closest('[data-acc]');

    if (borrar && libro) {
        borrarRegistro(libro, Number(borrar.dataset.borrarRegistro));
    } else if (boton) {
        const accion = boton.dataset.acc;
        if (accion === 'guardar-lectura' && libro) {
            if (guardarLectura(libro)) {
                renderizarPanelLibro();
                ofrecerBorrarFotos(libro);
                return;
            }
        } else if (accion === 'editar') {
            panelLibro.modo = 'editar';
            mensajeLibro = '';
        } else if (accion === 'guardar-libro') {
            if (guardarLibro()) {
                cerrarPanelLibro();
                return;
            }
        } else if (accion === 'eliminar-libro' && libro) {
            if (!confirm(`¿Eliminar "${libro.titulo}" y todo su historial? No se puede deshacer.`)) return;
            const datos = getDatosLibros();
            datos.libros = datos.libros.filter(l => l.id !== libro.id);
            datos.registro = datos.registro.filter(r => r.libroId !== libro.id);
            guardarDatosLibros();
            borrarFotosDeLibro(libro.id).catch(() => { });
            borrarNotasDeLibro(libro.id);
            guardarDatosLibros();
            cerrarPanelLibro();
            return;
        }
    } else {
        return;
    }
    renderizarPanelLibro();
}

function alHacerClicLibros(e) {
    const filtro = e.target.closest('[data-filtro]');
    const item = e.target.closest('[data-libro]');
    const boton = e.target.closest('[data-acc]');
    const nav = e.target.closest('[data-nav]');

    if (nav) {
        moverPeriodo(nav.dataset.nav, Number(nav.dataset.paso));
    } else if (filtro) {
        filtroBiblioteca = filtro.dataset.filtro;
        renderizarLibros();
    } else if (item) {
        const desde = Number(item.dataset.desde);
        abrirPanelLibro(Number(item.dataset.libro), {
            para: item.dataset.para || null,
            tramo: desde ? { desde, hasta: Number(item.dataset.hasta) } : null
        });
    } else if (boton && boton.dataset.acc === 'nuevo') {
        abrirPanelLibro(null);
    }
}

// Cambia la semana o el día que se está viendo (paso 0 = volver a hoy)
function moverPeriodo(tipo, paso) {
    if (tipo === 'semana') semanaOffset = paso === 0 ? 0 : Math.max(-52, Math.min(26, semanaOffset + paso));
    else diaOffset = paso === 0 ? 0 : Math.max(-60, Math.min(60, diaOffset + paso));
    renderizarLibros();
}

// Deslizar una tarjeta hacia los lados cambia de semana o de día
function iniciarDeslizarLibros(vista) {
    let inicio = null;
    vista.addEventListener('touchstart', (e) => {
        const tarjeta = e.target.closest('[data-desliza]');
        inicio = tarjeta && e.touches.length === 1
            ? { tipo: tarjeta.dataset.desliza, x: e.touches[0].clientX, y: e.touches[0].clientY }
            : null;
    }, { passive: true });
    vista.addEventListener('touchend', (e) => {
        if (!inicio) return;
        const dx = e.changedTouches[0].clientX - inicio.x;
        const dy = e.changedTouches[0].clientY - inicio.y;
        const tipo = inicio.tipo;
        inicio = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) moverPeriodo(tipo, dx < 0 ? 1 : -1);
    }, { passive: true });
}

// ===== Pestañas =====

function mostrarVista(nombre) {
    const enLibros = nombre === 'libros';
    document.getElementById('vista-biblia').hidden = enLibros;
    document.getElementById('vista-libros').hidden = !enLibros;
    document.getElementById('tab-biblia').classList.toggle('active', !enLibros);
    document.getElementById('tab-libros').classList.toggle('active', enLibros);
    document.getElementById('tab-biblia').setAttribute('aria-pressed', String(!enLibros));
    document.getElementById('tab-libros').setAttribute('aria-pressed', String(enLibros));
    if (enLibros) renderizarLibros();
    try {
        localStorage.setItem(VISTA_KEY, enLibros ? 'libros' : 'biblia');
    } catch (e) { }
}

function iniciarLibros() {
    document.getElementById('tab-biblia').addEventListener('click', () => mostrarVista('biblia'));
    document.getElementById('tab-libros').addEventListener('click', () => mostrarVista('libros'));
    document.getElementById('btn-libro-close').addEventListener('click', cerrarPanelLibro);
    document.getElementById('libro-body').addEventListener('click', alHacerClicPanelLibro);

    const vista = document.getElementById('vista-libros');
    vista.addEventListener('click', alHacerClicLibros);
    iniciarDeslizarLibros(vista);
    vista.addEventListener('input', (e) => {
        if (e.target.id !== 'lib-buscar') return;
        busquedaBiblioteca = e.target.value;
        document.getElementById('lib-lista').innerHTML = listaBibliotecaHTML();
    });

    let vistaInicial = 'biblia';
    try {
        vistaInicial = localStorage.getItem(VISTA_KEY) || 'biblia';
    } catch (e) { }
    mostrarVista(vistaInicial);
    iniciarFotos();
    iniciarNotas();
}
