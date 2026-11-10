/**
 * Fotos de las páginas de un libro.
 * Se guardan comprimidas en el propio dispositivo (IndexedDB) y no salen de él:
 * no van en el respaldo ni se suben a ningún lado.
 */

const FOTOS_DB = 'lecturaBiblica_fotos';
const FOTO_LADO_MAX = 1800;   // píxeles del lado más largo: suficiente para leer una página
const FOTO_CALIDAD = 0.8;

let fotosDB = null;
const conteoFotos = new Map(); // libroId -> cantidad de fotos (para mostrar el indicador 📷)
let urlsMiniaturas = [];
let visor = null;              // { libroId, fotos, indice, url }

// ===== Base de datos =====

function abrirFotosDB() {
    if (!fotosDB) {
        fotosDB = new Promise((resolver, rechazar) => {
            const pedido = indexedDB.open(FOTOS_DB, 1);
            pedido.onupgradeneeded = () => {
                const almacen = pedido.result.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
                almacen.createIndex('libroId', 'libroId');
            };
            pedido.onsuccess = () => resolver(pedido.result);
            pedido.onerror = () => rechazar(pedido.error);
        });
    }
    return fotosDB;
}

// Ejecuta una operación sobre el almacén y espera a que la transacción termine
function conAlmacen(modo, operacion) {
    return abrirFotosDB().then(db => new Promise((resolver, rechazar) => {
        const transaccion = db.transaction('fotos', modo);
        const pedido = operacion(transaccion.objectStore('fotos'));
        transaccion.oncomplete = () => resolver(pedido ? pedido.result : undefined);
        transaccion.onerror = () => rechazar(transaccion.error);
        transaccion.onabort = () => rechazar(transaccion.error);
    }));
}

function fotosDeLibro(libroId) {
    return conAlmacen('readonly', almacen => almacen.index('libroId').getAll(libroId))
        .then(fotos => fotos.sort((a, b) => a.orden - b.orden));
}

function guardarFoto(foto) {
    return conAlmacen('readwrite', almacen => almacen.add(foto));
}

function borrarFoto(id) {
    return conAlmacen('readwrite', almacen => almacen.delete(id));
}

function borrarFotosDeLibro(libroId) {
    return conAlmacen('readwrite', almacen => {
        const pedido = almacen.index('libroId').getAllKeys(libroId);
        pedido.onsuccess = () => pedido.result.forEach(clave => almacen.delete(clave));
        return null;
    }).then(() => {
        conteoFotos.delete(libroId);
    });
}

function cargarConteoFotos() {
    return conAlmacen('readonly', almacen => almacen.index('libroId').getAllKeys())
        .then(() => abrirFotosDB())
        .then(db => new Promise((resolver, rechazar) => {
            conteoFotos.clear();
            const cursor = db.transaction('fotos', 'readonly').objectStore('fotos').index('libroId').openKeyCursor();
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (!c) return resolver();
                conteoFotos.set(c.key, (conteoFotos.get(c.key) || 0) + 1);
                c.continue();
            };
            cursor.onerror = () => rechazar(cursor.error);
        }));
}

// ===== Compresión =====

// Reduce la foto a un tamaño cómodo para leer; así ocupa unas 10 veces menos
async function comprimirImagen(archivo) {
    const url = URL.createObjectURL(archivo);
    try {
        const imagen = await new Promise((resolver, rechazar) => {
            const img = new Image();
            img.onload = () => resolver(img);
            img.onerror = () => rechazar(new Error('No se pudo leer la imagen'));
            img.src = url;
        });
        const escala = Math.min(1, FOTO_LADO_MAX / Math.max(imagen.naturalWidth, imagen.naturalHeight));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(imagen.naturalWidth * escala);
        lienzo.height = Math.round(imagen.naturalHeight * escala);
        lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
        const blob = await new Promise(resolver => lienzo.toBlob(resolver, 'image/jpeg', FOTO_CALIDAD));
        return blob || archivo;
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function agregarFotosALibro(libroId, archivos) {
    const base = Date.now();
    let agregadas = 0;
    let fallidas = 0;

    for (let i = 0; i < archivos.length; i++) {
        try {
            const blob = await comprimirImagen(archivos[i]);
            await guardarFoto({ libroId, orden: base + i, blob, creado: new Date().toISOString() });
            agregadas++;
        } catch (e) {
            fallidas++;
        }
    }

    conteoFotos.set(libroId, (conteoFotos.get(libroId) || 0) + agregadas);
    // Pide al sistema que no borre estos datos por su cuenta
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    return { agregadas, fallidas };
}

// ===== Sección de fotos en la ficha del libro =====

function textoTamaño(bytes) {
    return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
}

function indicadorFotos(libroId) {
    const cantidad = conteoFotos.get(libroId) || 0;
    return cantidad > 0 ? ` <span class="foto-indicador">📷 ${cantidad}</span>` : '';
}

async function renderizarFotos(libroId, mensaje) {
    const seccion = document.getElementById('fotos-seccion');
    if (!seccion) return;

    let fotos = [];
    let error = '';
    try {
        fotos = await fotosDeLibro(libroId);
    } catch (e) {
        error = 'Este dispositivo no permite guardar fotos en la app.';
    }
    // La ficha pudo cerrarse o cambiar de libro mientras se leían las fotos
    if (!document.body.contains(seccion) || !panelLibro || panelLibro.id !== libroId) return;

    urlsMiniaturas.forEach(url => URL.revokeObjectURL(url));
    urlsMiniaturas = fotos.map(foto => URL.createObjectURL(foto.blob));

    const peso = fotos.reduce((suma, foto) => suma + (foto.blob.size || 0), 0);
    const miniaturas = fotos.map((foto, i) => `
        <button type="button" class="foto-mini" data-foto-ver="${i}" aria-label="Ver foto ${i + 1}">
            <img src="${urlsMiniaturas[i]}" alt="Foto ${i + 1}" loading="lazy">
            <span>${i + 1}</span>
        </button>`).join('');

    seccion.innerHTML = `
        <h3 class="lib-h3">Fotos de las páginas</h3>
        <p class="cfg-hint">${fotos.length
            ? `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'} · ${textoTamaño(peso)} · toca una para leerla`
            : 'Sube las fotos del capítulo de esta semana para leerlas desde aquí.'}</p>
        ${fotos.length ? `<div class="foto-grilla">${miniaturas}</div>` : ''}
        <div class="backup-actions">
            <label class="backup-btn" for="fotos-input">＋ Agregar fotos</label>
            <input type="file" id="fotos-input" accept="image/*" multiple hidden>
            ${fotos.length ? '<button type="button" class="backup-btn" data-foto-acc="borrar-todas">Borrar todas</button>' : ''}
        </div>
        <p class="backup-status ${error ? 'error' : ''}" role="status" aria-live="polite">${error || mensaje || ''}</p>
    `;
    seccion._fotos = fotos;
}

async function alElegirFotos(e) {
    if (e.target.id !== 'fotos-input' || !panelLibro || !panelLibro.id) return;
    const archivos = [...e.target.files];
    const libroId = panelLibro.id;
    if (archivos.length === 0) return;

    const estado = document.querySelector('#fotos-seccion .backup-status');
    if (estado) estado.textContent = `Guardando ${archivos.length} ${archivos.length === 1 ? 'foto' : 'fotos'}…`;

    const { agregadas, fallidas } = await agregarFotosALibro(libroId, archivos);
    let mensaje = `${agregadas} ${agregadas === 1 ? 'foto agregada' : 'fotos agregadas'}.`;
    if (fallidas > 0) mensaje += ` ${fallidas} no se pudieron guardar.`;
    renderizarFotos(libroId, mensaje);
}

async function alHacerClicFotos(e) {
    if (!panelLibro || !panelLibro.id) return;
    const libroId = panelLibro.id;
    const mini = e.target.closest('[data-foto-ver]');
    const accion = e.target.closest('[data-foto-acc]');

    if (mini) {
        const seccion = document.getElementById('fotos-seccion');
        abrirVisor(libroId, seccion._fotos || [], Number(mini.dataset.fotoVer));
    } else if (accion && accion.dataset.fotoAcc === 'borrar-todas') {
        const cantidad = conteoFotos.get(libroId) || 0;
        if (!confirm(`¿Borrar las ${cantidad} fotos de este libro? No se puede deshacer.`)) return;
        await borrarFotosDeLibro(libroId);
        renderizarFotos(libroId, 'Fotos borradas.');
    }
}

// Después de marcar una lectura: ofrece borrar las fotos que ya no hacen falta
async function ofrecerBorrarFotos(libro) {
    const cantidad = conteoFotos.get(libro.id) || 0;
    if (cantidad === 0) return;
    if (!confirm(`Tienes ${cantidad} ${cantidad === 1 ? 'foto' : 'fotos'} de "${libro.titulo}". ¿Borrarlas ahora que ya leíste?`)) return;
    await borrarFotosDeLibro(libro.id);
    renderizarFotos(libro.id, 'Fotos borradas.');
}

// ===== Visor a pantalla completa =====

function mostrarFotoVisor() {
    const foto = visor.fotos[visor.indice];
    if (visor.url) URL.revokeObjectURL(visor.url);
    visor.url = URL.createObjectURL(foto.blob);

    const imagen = document.getElementById('visor-img');
    const lienzo = document.getElementById('visor-lienzo');
    imagen.src = visor.url;
    lienzo.classList.remove('ampliado');
    lienzo.scrollTop = 0;
    lienzo.scrollLeft = 0;

    document.getElementById('visor-zoom').textContent = 'Ampliar';
    document.getElementById('visor-pos').textContent = `${visor.indice + 1} de ${visor.fotos.length}`;
    document.getElementById('visor-ant').disabled = visor.indice === 0;
    document.getElementById('visor-sig').disabled = visor.indice === visor.fotos.length - 1;
}

function abrirVisor(libroId, fotos, indice) {
    if (fotos.length === 0) return;
    visor = { libroId, fotos, indice, url: null };
    document.getElementById('foto-visor').hidden = false;
    mostrarFotoVisor();
}

function cerrarVisor() {
    if (!visor) return;
    if (visor.url) URL.revokeObjectURL(visor.url);
    const libroId = visor.libroId;
    visor = null;
    document.getElementById('foto-visor').hidden = true;
    document.getElementById('visor-img').removeAttribute('src');
    renderizarFotos(libroId);
}

function moverVisor(paso) {
    if (!visor) return;
    const nuevo = visor.indice + paso;
    if (nuevo < 0 || nuevo >= visor.fotos.length) return;
    visor.indice = nuevo;
    mostrarFotoVisor();
}

function alternarZoomVisor() {
    const lienzo = document.getElementById('visor-lienzo');
    const ampliado = lienzo.classList.toggle('ampliado');
    document.getElementById('visor-zoom').textContent = ampliado ? 'Ajustar' : 'Ampliar';
}

async function borrarFotoVisor() {
    if (!visor || !confirm('¿Borrar esta foto?')) return;
    const foto = visor.fotos[visor.indice];
    await borrarFoto(foto.id);
    conteoFotos.set(visor.libroId, Math.max(0, (conteoFotos.get(visor.libroId) || 1) - 1));
    visor.fotos.splice(visor.indice, 1);
    if (visor.fotos.length === 0) {
        cerrarVisor();
        return;
    }
    visor.indice = Math.min(visor.indice, visor.fotos.length - 1);
    mostrarFotoVisor();
}

function iniciarFotos() {
    const cuerpo = document.getElementById('libro-body');
    cuerpo.addEventListener('change', alElegirFotos);
    cuerpo.addEventListener('click', alHacerClicFotos);

    document.getElementById('visor-cerrar').addEventListener('click', cerrarVisor);
    document.getElementById('visor-ant').addEventListener('click', () => moverVisor(-1));
    document.getElementById('visor-sig').addEventListener('click', () => moverVisor(1));
    document.getElementById('visor-zoom').addEventListener('click', alternarZoomVisor);
    document.getElementById('visor-borrar').addEventListener('click', borrarFotoVisor);

    // Deslizar hacia los lados para pasar de página (solo con la foto sin ampliar)
    const lienzo = document.getElementById('visor-lienzo');
    let inicioX = null;
    let inicioY = null;
    lienzo.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { inicioX = null; return; }
        inicioX = e.touches[0].clientX;
        inicioY = e.touches[0].clientY;
    }, { passive: true });
    lienzo.addEventListener('touchend', (e) => {
        if (inicioX === null || lienzo.classList.contains('ampliado')) return;
        const dx = e.changedTouches[0].clientX - inicioX;
        const dy = e.changedTouches[0].clientY - inicioY;
        inicioX = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moverVisor(dx < 0 ? 1 : -1);
    }, { passive: true });

    if (!window.indexedDB) return;
    cargarConteoFotos().then(renderizarLibros).catch(() => { });
}
