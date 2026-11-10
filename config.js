/**
 * Configurador del plan de lectura bíblica.
 * Trabaja sobre un borrador en memoria; nada cambia hasta tocar "Guardar".
 * Usa el motor de planes definido en app.js.
 */

let borrador = null;          // plan que se está editando
let borradorGuardado = false; // ¿existe ya un plan guardado para ese año?
let borradorSucio = false;    // ¿hay cambios sin guardar?
let pickerAbierto = null;     // id de la sección con el selector de libros abierto
let fechaVistaPrevia = '';
let mensajeConfig = '';
let mensajeConfigError = false;

const RITMOS = [['auto', 'Automático (1 por día)'], ['parejo', 'Repartido en toda la vuelta'], [1, '1 por día'], [2, '2 por día'], [3, '3 por día'], [4, '4 por día'], [5, '5 por día']];
const OPCIONES_SALMO119 = [
    ['entero', 'Entero, en un día'],
    ['lugar', 'En 22 lecturas, en su lugar'],
    ['final', 'En 22 lecturas, al final de la vuelta']
];

// ===== Borrador =====

function añosConfigurables() {
    const actual = new Date().getFullYear();
    const años = new Set([actual, actual + 1, actual + 2]);
    Object.keys(getPlanes()).forEach(clave => años.add(Number(clave)));
    return [...años].sort((a, b) => a - b);
}

function cargarBorrador(año) {
    const planes = getPlanes();
    if (planes[año]) {
        borrador = JSON.parse(JSON.stringify(planes[año]));
        borradorGuardado = true;
    } else {
        // Parte del plan vigente anterior si existe; si no, de uno parecido al de siempre
        const previo = getPlanPara(new Date(año, 0, 1));
        borrador = previo ? JSON.parse(JSON.stringify(previo)) : planPredeterminado(año);
        borrador.inicio = año;
        borradorGuardado = false;
    }
    if (!borrador.nextId) borrador.nextId = Math.max(0, ...borrador.secciones.map(s => s.id)) + 1;
    borradorSucio = false;
    pickerAbierto = null;
    fechaVistaPrevia = `${año}-01-01`;
    mensajeConfig = '';
}

function seccionPorId(id) {
    return borrador.secciones.find(sec => sec.id === id);
}

function marcarCambio() {
    borradorSucio = true;
    mensajeConfig = '';
}

// ===== Cálculos para el resumen =====

function formatearDiaCorto(fecha, conAño) {
    const opciones = conAño ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
    return fecha.toLocaleDateString('es-ES', opciones);
}

function resumenSeccion(sec, plan) {
    const total = unidadesDeSeccion(sec).length;
    if (total === 0) return { texto: 'Elige los libros de esta sección.', aviso: true };

    const rondas = rondasDeSeccion(sec, plan);
    const variosAños = sec.frecuencia[0] === 'p';
    const porDia = sec.ritmo === 'auto' ? 1 : Number(sec.ritmo);
    const minDias = Math.min(...rondas.map(r => r.dias));
    const maxDias = Math.max(...rondas.map(r => r.dias));
    const textoDias = minDias === maxDias ? `${minDias} días` : `${minDias} a ${maxDias} días`;
    const base = `${total} lecturas por vuelta, en ${textoDias}. `;

    if (sec.ritmo === 'parejo' && total < minDias) {
        const cada = (minDias / total).toFixed(1).replace('.', ',');
        return {
            texto: `${base}Repartido en toda la vuelta: una lectura cada ${cada} días, con ${minDias - total} días libres intercalados.`,
            aviso: false
        };
    }

    if (sec.ritmo !== 'parejo' && porDia * minDias >= total) {
        const diasLectura = Math.ceil(total / porDia);
        const fines = rondas.map(r => formatearDiaCorto(sumarDias(r.inicio, diasLectura - 1), variosAños));
        const libresMin = minDias - diasLectura;
        const libresMax = maxDias - diasLectura;
        let texto = `${base}${porDia} por día; termina el ${fines.join(', el ')}`;
        if (libresMax > 0) {
            const libres = libresMin === libresMax ? `${libresMax}` : `${libresMin} a ${libresMax}`;
            texto += `. Quedan ${libres} días libres al final de cada vuelta.`;
        } else {
            texto += ', justo al cierre del periodo.';
        }
        return { texto, aviso: false };
    }

    // No alcanza al ritmo pedido en la vuelta más corta: se reparte parejo
    const piso = Math.floor(total / minDias);
    const diasConMas = total - piso * minDias;
    const donde = minDias === maxDias ? '' : 'En la vuelta más corta, ';
    let reparto;
    if (diasConMas === 0) {
        reparto = `${donde}se leerán ${piso} por día`;
    } else {
        reparto = `${donde}se repartirán entre ${piso} y ${piso + 1} por día (${diasConMas} ${diasConMas === 1 ? 'día' : 'días'} con ${piso + 1})`;
    }
    reparto = reparto.charAt(0).toUpperCase() + reparto.slice(1);

    if (sec.ritmo === 'parejo') {
        return { texto: `${base}${reparto}.`, aviso: false };
    }
    if (sec.ritmo === 'auto') {
        return { texto: `${base}${reparto} para que entre completo.`, aviso: false };
    }
    return {
        texto: `${base}Con ${porDia} por día faltan días. ${reparto} para que entre completo.`,
        aviso: true
    };
}

function resumenGlobal(plan) {
    const inicio = new Date(plan.inicio, 0, 1);
    const diasAño = diaNum(new Date(plan.inicio + 1, 0, 1)) - diaNum(inicio);
    let minimo = Infinity, maximo = 0, suma = 0;

    for (let d = 0; d < diasAño; d++) {
        const lecturas = getLecturasConPlan(plan, sumarDias(inicio, d));
        const cantidad = lecturas.reduce((acc, l) => acc + l.cantidad, 0);
        minimo = Math.min(minimo, cantidad);
        maximo = Math.max(maximo, cantidad);
        suma += cantidad;
    }

    const usos = new Array(BIBLIA.length).fill(0);
    plan.secciones.forEach(sec => new Set(sec.libros).forEach(i => usos[i]++));
    const sinAsignar = usos.map((n, i) => (n === 0 ? i : -1)).filter(i => i >= 0);
    const repetidos = usos.map((n, i) => (n > 1 ? i : -1)).filter(i => i >= 0);

    return { minimo, maximo, promedio: suma / diasAño, sinAsignar, repetidos };
}

// ===== Dibujo =====

function opcionesHTML(opciones, seleccionada) {
    return opciones.map(([valor, texto]) =>
        `<option value="${valor}" ${String(valor) === String(seleccionada) ? 'selected' : ''}>${texto}</option>`
    ).join('');
}

function pickerHTML(sec) {
    const enOtras = new Set();
    borrador.secciones.forEach(otra => {
        if (otra.id !== sec.id) otra.libros.forEach(i => enOtras.add(i));
    });
    const propios = new Set(sec.libros);

    const chips = (desde, hasta) => {
        let html = '';
        for (let i = desde; i <= hasta; i++) {
            const clases = ['cfg-chip'];
            if (propios.has(i)) clases.push('on');
            else if (enOtras.has(i)) clases.push('usado');
            html += `<button type="button" class="${clases.join(' ')}" data-libro="${i}" aria-pressed="${propios.has(i)}">${BIBLIA[i].nombreEs}</button>`;
        }
        return html;
    };

    return `
        <div class="cfg-picker">
            <p class="cfg-picker-title">Antiguo Testamento</p>
            <div class="cfg-chips">${chips(0, 38)}</div>
            <p class="cfg-picker-title">Nuevo Testamento</p>
            <div class="cfg-chips">${chips(39, 65)}</div>
            <p class="cfg-hint">Dorado: en esta sección. Atenuado: ya está en otra sección.</p>
        </div>
    `;
}

function seccionHTML(sec) {
    const resumen = resumenSeccion(sec, borrador);
    const capitulos = [...new Set(sec.libros)].reduce((acc, i) => acc + BIBLIA[i].capitulos, 0);
    const tieneSalmos = sec.libros.includes(IDX_SALMOS);
    const abierto = pickerAbierto === sec.id;
    const detalle = sec.libros.length
        ? `${esc(describirLibros(sec.libros))} · ${capitulos} capítulos`
        : 'Sin libros todavía';

    return `
        <div class="cfg-sec" data-id="${sec.id}">
            <div class="cfg-sec-head">
                <span class="legend-color block-${sec.color || 1}"></span>
                <input type="text" class="cfg-nombre" value="${esc(sec.nombre || '')}"
                    placeholder="${esc(describirLibros(sec.libros) || 'Nombre de la sección')}"
                    aria-label="Nombre de la sección" maxlength="40">
                <button type="button" class="cfg-del" data-acc="borrar" aria-label="Eliminar sección">✕</button>
            </div>
            <p class="cfg-libros">${detalle}</p>
            <button type="button" class="backup-btn" data-acc="libros">${abierto ? 'Listo' : 'Elegir libros'}</button>
            ${abierto ? pickerHTML(sec) : ''}
            <div class="cfg-fields">
                <label>Vueltas
                    <select data-campo="frecuencia">${opcionesHTML(FRECUENCIAS, sec.frecuencia)}</select>
                </label>
                <label>Lecturas por día
                    <select data-campo="ritmo">${opcionesHTML(RITMOS, sec.ritmo)}</select>
                </label>
                ${tieneSalmos ? `<label>Salmo 119
                    <select data-campo="salmo119">${opcionesHTML(OPCIONES_SALMO119, sec.salmo119 || 'entero')}</select>
                </label>` : ''}
            </div>
            <p class="cfg-info ${resumen.aviso ? 'aviso' : ''}">${resumen.texto}</p>
        </div>
    `;
}

function resumenGlobalHTML() {
    const g = resumenGlobal(borrador);
    const nombres = lista => lista.map(i => BIBLIA[i].nombreEs).join(', ');
    const rango = g.minimo === g.maximo ? `${g.maximo}` : `entre ${g.minimo} y ${g.maximo}`;

    let html = `<p><strong>En ${borrador.inicio}:</strong> ${rango} lecturas por día (promedio ${g.promedio.toFixed(1)}).</p>`;
    if (g.sinAsignar.length > 0) {
        html += `<p class="aviso">Libros que no están en ninguna sección: ${nombres(g.sinAsignar)}.</p>`;
    } else {
        html += '<p class="ok">Los 66 libros están incluidos.</p>';
    }
    if (g.repetidos.length > 0) {
        html += `<p class="aviso">Libros en más de una sección: ${nombres(g.repetidos)}.</p>`;
    }
    return html;
}

function vistaPreviaHTML() {
    const fecha = new Date(fechaVistaPrevia + 'T00:00:00');
    let lista = '<li class="cfg-info">Elige una fecha.</li>';
    if (!isNaN(fecha.getTime())) {
        const lecturas = fecha.getFullYear() < borrador.inicio ? [] : getLecturasConPlan(borrador, fecha);
        lista = lecturas.length
            ? lecturas.map(l => `<li><span class="legend-color block-${l.color}"></span>${esc(l.textoCompleto)}</li>`).join('')
            : '<li class="cfg-info">Sin lecturas ese día.</li>';
    }
    return `
        <div class="cfg-preview">
            <label>Ver las lecturas de un día
                <input type="date" id="cfg-fecha" value="${fechaVistaPrevia}" min="${borrador.inicio}-01-01">
            </label>
            <ul>${lista}</ul>
        </div>
    `;
}

function renderizarConfigurador() {
    const año = borrador.inicio;
    const añoActual = new Date().getFullYear();
    const años = añosConfigurables().map(a => [a, `${a}${getPlanes()[a] ? ' (guardado)' : ''}`]);

    let estado;
    if (borradorSucio) estado = 'Cambios sin guardar';
    else if (borradorGuardado) estado = 'Plan guardado';
    else estado = 'Propuesta, aún sin guardar';

    let ayuda = borradorGuardado
        ? `Este plan rige desde el 1 de enero de ${año} hasta que guardes otro para un año posterior.`
        : `Mientras no guardes un plan para ${año}, ese año seguirá con el plan vigente hoy.`;
    if (año <= añoActual) {
        ayuda += ` Ojo: cambiar el plan de ${año} modifica las lecturas de todo el año, incluidos los días que ya marcaste.`;
    }

    document.getElementById('config-body').innerHTML = `
        <div class="cfg-top">
            <label>Año del plan
                <select id="cfg-anio">${opcionesHTML(años, año)}</select>
            </label>
            <span class="cfg-estado ${borradorSucio ? 'sucio' : ''}">${estado}</span>
        </div>
        <p class="cfg-hint">${ayuda}</p>

        <div class="cfg-resumen">${resumenGlobalHTML()}</div>

        ${borrador.secciones.map(seccionHTML).join('')}

        <button type="button" class="backup-btn cfg-add" data-acc="agregar">＋ Agregar sección</button>

        ${vistaPreviaHTML()}

        <div class="cfg-actions">
            <button type="button" class="cfg-save" data-acc="guardar">Guardar plan ${año}</button>
            ${borradorGuardado ? `<button type="button" class="backup-btn" data-acc="eliminar">Eliminar plan ${año}</button>` : ''}
        </div>
        <p class="backup-status ${mensajeConfigError ? 'error' : ''}" role="status" aria-live="polite">${mensajeConfig}</p>
    `;
}

// ===== Acciones =====

function guardarBorrador() {
    if (!borrador.secciones.some(sec => sec.libros.length > 0)) {
        mensajeConfig = 'Agrega al menos una sección con libros antes de guardar.';
        mensajeConfigError = true;
        return;
    }
    const planes = { ...getPlanes() };
    planes[borrador.inicio] = JSON.parse(JSON.stringify(borrador));
    guardarPlanes(planes);
    borradorGuardado = true;
    borradorSucio = false;
    mensajeConfig = `Plan ${borrador.inicio} guardado.`;
    mensajeConfigError = false;
    generarCalendario();
    renderizarLecturas();
}

function eliminarPlanGuardado() {
    const año = borrador.inicio;
    if (!confirm(`¿Eliminar el plan guardado de ${año}? Ese año volverá al plan anterior. Tus lecturas marcadas no se borran.`)) return;
    const planes = { ...getPlanes() };
    delete planes[año];
    guardarPlanes(planes);
    cargarBorrador(año);
    mensajeConfig = `Plan ${año} eliminado.`;
    mensajeConfigError = false;
    generarCalendario();
    renderizarLecturas();
}

function agregarSeccion() {
    const usados = new Set(borrador.secciones.map(sec => sec.color));
    let color = 1;
    while (usados.has(color) && color < TOTAL_COLORES) color++;
    const id = borrador.nextId++;
    borrador.secciones.push({ id, color, nombre: '', libros: [], frecuencia: 'a1', ritmo: 'auto', salmo119: 'entero' });
    pickerAbierto = id;
    marcarCambio();
}

function alHacerClicConfig(e) {
    const chip = e.target.closest('[data-libro]');
    const boton = e.target.closest('[data-acc]');
    if (!chip && !boton) return;

    const tarjeta = e.target.closest('.cfg-sec');
    const sec = tarjeta ? seccionPorId(Number(tarjeta.dataset.id)) : null;

    if (chip && sec) {
        const idx = Number(chip.dataset.libro);
        sec.libros = sec.libros.includes(idx)
            ? sec.libros.filter(i => i !== idx)
            : [...sec.libros, idx].sort((a, b) => a - b);
        marcarCambio();
    } else if (boton) {
        const accion = boton.dataset.acc;
        if (accion === 'agregar') agregarSeccion();
        else if (accion === 'guardar') guardarBorrador();
        else if (accion === 'eliminar') eliminarPlanGuardado();
        else if (accion === 'libros' && sec) pickerAbierto = pickerAbierto === sec.id ? null : sec.id;
        else if (accion === 'borrar' && sec) {
            if (sec.libros.length > 0 && !confirm(`¿Eliminar la sección "${nombreSeccion(sec)}"?`)) return;
            borrador.secciones = borrador.secciones.filter(s => s.id !== sec.id);
            marcarCambio();
        }
    }
    renderizarConfigurador();
}

function alCambiarConfig(e) {
    const destino = e.target;

    if (destino.id === 'cfg-anio') {
        if (borradorSucio && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) {
            destino.value = borrador.inicio;
            return;
        }
        cargarBorrador(Number(destino.value));
    } else if (destino.id === 'cfg-fecha') {
        fechaVistaPrevia = destino.value;
    } else {
        const tarjeta = destino.closest('.cfg-sec');
        const sec = tarjeta ? seccionPorId(Number(tarjeta.dataset.id)) : null;
        if (!sec) return;
        if (destino.classList.contains('cfg-nombre')) {
            sec.nombre = destino.value.trim();
        } else if (destino.dataset.campo === 'ritmo') {
            sec.ritmo = isNaN(Number(destino.value)) ? destino.value : Number(destino.value);
        } else if (destino.dataset.campo) {
            sec[destino.dataset.campo] = destino.value;
        } else {
            return;
        }
        marcarCambio();
    }
    renderizarConfigurador();
}

function abrirConfigurador() {
    const actual = new Date().getFullYear();
    const planes = getPlanes();
    // Por defecto se prepara el año que viene; si ya hay plan este año y no el próximo, se edita este
    cargarBorrador(!planes[actual] || planes[actual + 1] ? actual + 1 : actual);
    renderizarConfigurador();
    const panel = document.getElementById('config-panel');
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('config-abierto');
}

function cerrarConfigurador() {
    if (borradorSucio && !confirm('Tienes cambios sin guardar. ¿Cerrar sin guardar?')) return;
    document.getElementById('config-panel').hidden = true;
    document.body.classList.remove('config-abierto');
}

function iniciarConfigurador() {
    document.getElementById('btn-config').addEventListener('click', abrirConfigurador);
    document.getElementById('btn-config-close').addEventListener('click', cerrarConfigurador);
    const cuerpo = document.getElementById('config-body');
    cuerpo.addEventListener('click', alHacerClicConfig);
    cuerpo.addEventListener('change', alCambiarConfig);
}
