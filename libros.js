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
    return {
        id: libro.id,
        titulo: String(libro.titulo || '').trim(),
        autor: String(libro.autor || '').trim(),
        estado: ESTADOS.some(e => e[0] === libro.estado) ? libro.estado : 'pendiente',
        dia: entero(libro.dia, null) && libro.dia <= 7 ? Number(libro.dia) : null,
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
            nota: String(r.nota || '')
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

// ===== Vista principal =====

function semanaHTML() {
    const datos = getDatosLibros();
    const hoy = hoySinHora();
    const lunes = lunesDe(hoy);
    const domingo = sumarDias(lunes, 6);
    const desdeISO = formatearFechaISO(lunes);
    const hastaISO = formatearFechaISO(domingo);
    const activos = datos.libros.filter(l => l.estado === 'leyendo' && l.dia);

    const titulo = `${lunes.getDate()}${lunes.getMonth() === domingo.getMonth() ? '' : ' de ' + lunes.toLocaleDateString('es-ES', { month: 'long' })}` +
        ` al ${domingo.getDate()} de ${domingo.toLocaleDateString('es-ES', { month: 'long' })}`;

    let filas = '';
    for (let d = 0; d < 7; d++) {
        const fecha = sumarDias(lunes, d);
        const esHoy = fecha.getTime() === hoy.getTime();
        const delDia = activos.filter(l => l.dia === d + 1);

        const items = delDia.map(libro => {
            const leidos = datos.registro.filter(r => r.libroId === libro.id && r.fecha >= desdeISO && r.fecha <= hastaISO);
            let estado;
            if (leidos.length > 0) {
                const desde = Math.min(...leidos.map(r => r.desde));
                const hasta = Math.max(...leidos.map(r => r.hasta));
                const aMedias = leidos.some(r => !r.completo && r.hasta === hasta);
                estado = `<span class="lib-toca leido">✓ Leído: ${esc(textoTramo(libro, desde, hasta))}${aMedias ? ' (a medias)' : ''}</span>`;
            } else {
                estado = `<span class="lib-toca">Toca: ${esc(textoToca(libro))}</span>`;
            }
            return `
                <button type="button" class="lib-item" data-libro="${libro.id}">
                    <span class="lib-titulo">${esc(libro.titulo)}${indicadorFotos(libro.id)}${indicadorNotas(libro.id)}</span>
                    <span class="lib-autor">${esc(libro.autor)}</span>
                    ${estado}
                </button>`;
        }).join('');

        filas += `
            <div class="lib-dia ${esHoy ? 'hoy' : ''}">
                <div class="lib-dia-nombre">${DIAS_SEMANA[d].slice(0, 3)}<span>${fecha.getDate()}</span></div>
                <div class="lib-dia-cuerpo">${items || '<span class="lib-vacio">Sin libro asignado</span>'}</div>
            </div>`;
    }

    return `
        <section class="lib-card">
            <h2>Esta semana</h2>
            <p class="lib-sub">Del ${titulo}</p>
            ${filas}
        </section>`;
}

function listaBibliotecaHTML() {
    const datos = getDatosLibros();
    const texto = busquedaBiblioteca.trim().toLowerCase();
    const libros = datos.libros
        .filter(l => l.estado === filtroBiblioteca)
        .filter(l => !texto || `${l.titulo} ${l.autor}`.toLowerCase().includes(texto))
        .sort((a, b) => (a.dia || 9) - (b.dia || 9) || a.autor.localeCompare(b.autor, 'es') || a.titulo.localeCompare(b.titulo, 'es'));

    if (libros.length === 0) {
        return `<p class="lib-vacio">${texto ? 'Ningún libro coincide con la búsqueda.' : 'No hay libros en esta lista.'}</p>`;
    }

    return libros.map(libro => {
        const detalles = [];
        if (libro.estado === 'leyendo') {
            if (libro.dia) detalles.push(DIAS_SEMANA[libro.dia - 1]);
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
    vista.innerHTML = semanaHTML() + bibliotecaHTML();
}

// ===== Ficha del libro =====

function campoHTML(etiqueta, contenido) {
    return `<label>${etiqueta}${contenido}</label>`;
}

function panelLecturaHTML(libro) {
    const datos = getDatosLibros();
    const { desde, hasta } = tramoSiguiente(libro);
    const nombreUnidad = (UNIDADES[libro.unidad] || UNIDADES['capítulo'])[2];
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
        <p class="lib-ficha-autor">${esc(libro.autor)}${libro.dia ? ` · ${DIAS_SEMANA[libro.dia - 1]}` : ''}</p>
        ${avance ? `<p class="cfg-hint">${esc(avance)}</p>` : ''}

        <div class="cfg-sec">
            <p class="lib-ficha-toca">Toca: ${esc(textoToca(libro))}</p>
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
    const dias = [['', 'Sin día fijo'], ...DIAS_SEMANA.map((nombre, i) => [i + 1, nombre])];
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
                ${campoHTML('Día de la semana', `<select id="ed-dia">${opciones(dias, l.dia)}</select>`)}
                ${campoHTML('Avanzo por', `<select id="ed-unidad">${opciones(unidades, l.unidad)}</select>`)}
                ${campoHTML('Cuántos por vez', `<input type="number" id="ed-ritmo" inputmode="numeric" min="1" value="${l.ritmo}">`)}
                ${campoHTML('Lo próximo que toca', `<input type="number" id="ed-siguiente" inputmode="numeric" min="1" value="${l.siguiente}">`)}
                ${campoHTML('Total (si lo sabes)', `<input type="number" id="ed-total" inputmode="numeric" min="1" value="${l.total || ''}">`)}
                ${campoHTML('Páginas del libro', `<input type="number" id="ed-paginas" inputmode="numeric" min="1" value="${l.paginas || ''}">`)}
            </div>
            <div class="lib-form">
                ${campoHTML('Detalle de dónde voy (opcional)', `<input type="text" id="ed-detalle" maxlength="120" value="${esc(l.detalle)}" placeholder="Ej.: Romanos 6">`)}
            </div>
            <label class="lib-check"><input type="checkbox" id="ed-medias" ${l.aMedias ? 'checked' : ''}>
                <span>Lo próximo ya está empezado (quedó a medias)</span></label>
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

function abrirPanelLibro(id) {
    const libro = id ? libroPorId(id) : null;
    panelLibro = { modo: libro && libro.estado === 'leyendo' ? 'lectura' : 'editar', id: libro ? libro.id : null };
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
    datos.registro.push({
        id: nuevoId(),
        libroId: libro.id,
        fecha,
        desde,
        hasta,
        completo: !aMedias,
        nota: document.getElementById('lec-nota').value.trim()
    });

    libro.siguiente = aMedias ? hasta : hasta + 1;
    libro.aMedias = aMedias;
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

    const libro = normalizarLibro({
        id: existente ? existente.id : null,
        titulo: valor('ed-titulo'),
        autor: valor('ed-autor'),
        estado: valor('ed-estado'),
        dia: valor('ed-dia'),
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

    if (filtro) {
        filtroBiblioteca = filtro.dataset.filtro;
        renderizarLibros();
    } else if (item) {
        abrirPanelLibro(Number(item.dataset.libro));
    } else if (boton && boton.dataset.acc === 'nuevo') {
        abrirPanelLibro(null);
    }
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
