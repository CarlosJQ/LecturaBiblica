/**
 * Notas y audios de cada libro.
 * El texto de las notas vive con los datos de libros (y va en el respaldo).
 * Los audios se guardan solo en el dispositivo (IndexedDB), igual que las fotos;
 * se pueden compartir para transcribirlos y borrarlos después sin perder la nota.
 */

let borradorNota = '';       // lo que se está escribiendo, para no perderlo al redibujar
let editandoNota = null;     // id de la nota que se está editando
let mensajeNotas = '';
let mensajeNotasError = false;
let grabacion = null;        // { recorder, stream, trozos, inicio, reloj, libroId, ref }
let audioSonando = null;     // { notaId, url }
let guardandoAudios = 0;     // audios a medio guardar (para no limpiarlos por error)

// ===== Datos =====

function getNotas() {
    const datos = getDatosLibros();
    if (!Array.isArray(datos.notas)) datos.notas = [];
    return datos.notas;
}

function notasDeLibro(libroId) {
    return getNotas().filter(n => n.libroId === libroId).sort((a, b) => b.id - a.id);
}

function indicadorNotas(libroId) {
    const cantidad = getNotas().filter(n => n.libroId === libroId).length;
    return cantidad > 0 ? ` <span class="foto-indicador">📝 ${cantidad}</span>` : '';
}

function guardarAudio(libroId, blob) {
    return conAlmacen('readwrite', almacen => almacen.add({ libroId, blob, creado: new Date().toISOString() }), 'audios');
}

function leerAudio(id) {
    return conAlmacen('readonly', almacen => almacen.get(id), 'audios');
}

function borrarAudio(id) {
    return conAlmacen('readwrite', almacen => almacen.delete(id), 'audios');
}

// Al eliminar un libro: borra sus notas y sus audios
function borrarNotasDeLibro(libroId) {
    const datos = getDatosLibros();
    const audios = getNotas()
        .filter(n => n.libroId === libroId && n.audio && n.audio.equipo === getEquipo().id)
        .map(n => n.audio.id);
    datos.notas = getNotas().filter(n => n.libroId !== libroId);
    return Promise.all(audios.map(id => borrarAudio(id).catch(() => { })));
}

// Tras sincronizar: borra audios y fotos que quedaron sin dueño en este equipo
// (por ejemplo, si la nota o el libro se borraron desde otro equipo)
async function limpiarArchivosHuerfanos() {
    if (guardandoAudios > 0 || grabacion || !window.indexedDB) return;
    try {
        const datos = getDatosLibros();
        const audiosVivos = new Set(getNotas()
            .filter(n => n.audio && n.audio.equipo === getEquipo().id)
            .map(n => n.audio.id));
        const clavesAudio = await conAlmacen('readonly', almacen => almacen.getAllKeys(), 'audios');
        if (guardandoAudios > 0 || grabacion) return;
        for (const clave of clavesAudio) {
            if (!audiosVivos.has(clave)) await borrarAudio(clave);
        }

        const librosVivos = new Set(datos.libros.map(l => l.id));
        for (const libroId of [...conteoFotos.keys()]) {
            if (!librosVivos.has(libroId)) await borrarFotosDeLibro(libroId);
        }
    } catch (e) { }
}

// ===== Textos =====

function textoDuracion(segundos) {
    const s = Math.max(0, Math.round(segundos || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fechaNota(nota) {
    return new Date(nota.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function extensionAudio(tipo) {
    if (/mp4|m4a|aac/.test(tipo)) return 'm4a';
    if (/webm/.test(tipo)) return 'webm';
    if (/mpeg|mp3/.test(tipo)) return 'mp3';
    if (/wav/.test(tipo)) return 'wav';
    if (/ogg/.test(tipo)) return 'ogg';
    return 'm4a';
}

function textoDeTodasLasNotas(libro) {
    const notas = notasDeLibro(libro.id).reverse(); // de la más antigua a la más nueva
    const bloques = notas.map(nota => {
        const cabecera = `[${fechaNota(nota)}${nota.ref ? ' · ' + nota.ref : ''}]`;
        const cuerpo = nota.texto || (nota.audio ? '(audio sin transcribir)' : '');
        return `${cabecera}\n${cuerpo}`;
    });
    return `${libro.titulo}${libro.autor ? ' — ' + libro.autor : ''}\n\n${bloques.join('\n\n')}\n`;
}

// ===== Dibujo =====

function notaHTML(nota) {
    const cabecera = `${fechaNota(nota)}${nota.ref ? ' · ' + esc(nota.ref) : ''}`;

    if (editandoNota === nota.id) {
        return `
            <li class="nota" data-nota="${nota.id}">
                <p class="nota-cabecera">${cabecera}</p>
                <label>Sobre qué parte
                    <input type="text" id="nota-edit-ref" maxlength="60" value="${esc(nota.ref || '')}">
                </label>
                <textarea id="nota-edit-texto" class="nota-texto" rows="5"
                    placeholder="Escribe o dicta la transcripción">${esc(nota.texto || '')}</textarea>
                <div class="backup-actions">
                    <button type="button" class="backup-btn nota-principal" data-nota-acc="guardar-edicion">Guardar</button>
                    <button type="button" class="backup-btn" data-nota-acc="cancelar-edicion">Cancelar</button>
                </div>
            </li>`;
    }

    let audio = '';
    if (nota.audio && nota.audio.equipo !== getEquipo().id) {
        // Los audios no se sincronizan: se quedan en el equipo donde se grabaron
        audio = `<p class="lib-vacio">🎙 Audio de ${textoDuracion(nota.audio.duracion)} guardado en otro equipo` +
            `${nota.audio.equipoNombre ? ` (${esc(nota.audio.equipoNombre)})` : ''}.</p>`;
    } else if (nota.audio) {
        const sonando = audioSonando && audioSonando.notaId === nota.id;
        audio = `
            <div class="nota-audio">
                ${sonando
                ? `<audio controls autoplay src="${audioSonando.url}"></audio>`
                : `<button type="button" class="backup-btn" data-nota-acc="escuchar">▶ Escuchar (${textoDuracion(nota.audio.duracion)})</button>`}
                <button type="button" class="backup-btn" data-nota-acc="compartir">Compartir audio</button>
                <button type="button" class="backup-btn" data-nota-acc="borrar-audio">Borrar audio</button>
            </div>`;
    }

    const texto = nota.texto
        ? `<p class="nota-cuerpo">${esc(nota.texto)}</p>`
        : (nota.audio ? '<p class="lib-vacio">Audio sin transcribir todavía.</p>' : '');

    return `
        <li class="nota" data-nota="${nota.id}">
            <p class="nota-cabecera">${cabecera}</p>
            ${texto}
            ${audio}
            <div class="backup-actions">
                <button type="button" class="backup-btn" data-nota-acc="editar">${nota.audio && !nota.texto ? 'Transcribir' : 'Editar'}</button>
                <button type="button" class="backup-btn" data-nota-acc="borrar">Borrar nota</button>
            </div>
        </li>`;
}

function renderizarNotas(libroId) {
    const seccion = document.getElementById('notas-seccion');
    const libro = libroPorId(libroId);
    if (!seccion || !libro) return;

    const notas = notasDeLibro(libroId);
    const grabando = grabacion && grabacion.libroId === libroId;
    const { desde, hasta } = tramoSiguiente(libro);
    const refSugerida = textoTramo(libro, desde, hasta);

    seccion.innerHTML = `
        <h3 class="lib-h3">Notas y audios</h3>
        <label>Sobre qué parte
            <input type="text" id="nota-ref" maxlength="60" value="${esc(refSugerida)}">
        </label>
        <textarea id="nota-texto" class="nota-texto" rows="4"
            placeholder="Escribe una nota, o díctala con el micrófono del teclado">${esc(borradorNota)}</textarea>
        ${grabando ? `
            <div class="nota-grabando">
                <span>● Grabando <strong id="nota-reloj">0:00</strong></span>
                <button type="button" class="backup-btn nota-principal" data-nota-acc="detener">Detener y guardar</button>
            </div>` : `
            <div class="backup-actions">
                <button type="button" class="backup-btn nota-principal" data-nota-acc="guardar">Guardar nota</button>
                <button type="button" class="backup-btn" data-nota-acc="grabar">● Grabar audio</button>
                <label class="backup-btn" for="nota-audio-input">Adjuntar audio</label>
                <input type="file" id="nota-audio-input" accept="audio/*" hidden>
            </div>`}
        <p class="backup-status ${mensajeNotasError ? 'error' : ''}" role="status" aria-live="polite">${esc(mensajeNotas)}</p>
        ${notas.length ? `
            <ul class="nota-lista">${notas.map(notaHTML).join('')}</ul>
            <button type="button" class="backup-btn lib-ancho" data-nota-acc="copiar-todas">Copiar todas las notas</button>`
            : '<p class="lib-vacio">Todavía no hay notas de este libro.</p>'}
    `;
    if (grabando) actualizarRelojGrabacion();
}

function avisarNotas(texto, esError) {
    mensajeNotas = texto;
    mensajeNotasError = !!esError;
}

// ===== Crear notas =====

function crearNota(libroId, texto, ref, audio) {
    const datos = getDatosLibros();
    getNotas().push({
        id: nuevoId(),
        libroId,
        fecha: formatearFechaISO(new Date()),
        ref: String(ref || '').trim(),
        texto: String(texto || '').trim(),
        audio: audio || null
    });
    guardarDatosLibros();
}

function duracionDeAudio(blob) {
    return new Promise(resolver => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        const terminar = (valor) => {
            URL.revokeObjectURL(url);
            resolver(Number.isFinite(valor) ? valor : 0);
        };
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => terminar(audio.duration);
        audio.onerror = () => terminar(0);
        setTimeout(() => terminar(0), 4000);
        audio.src = url;
    });
}

async function crearNotaConAudio(libroId, blob, ref, duracion) {
    guardandoAudios++;
    try {
        await crearNotaConAudioInterno(libroId, blob, ref, duracion);
    } finally {
        guardandoAudios--;
    }
}

async function crearNotaConAudioInterno(libroId, blob, ref, duracion) {
    const id = await guardarAudio(libroId, blob);
    const segundos = duracion || await duracionDeAudio(blob);
    crearNota(libroId, borradorNota, ref, {
        id, tipo: blob.type || 'audio/mp4', duracion: segundos, peso: blob.size,
        equipo: getEquipo().id, equipoNombre: getEquipo().nombre
    });
    borradorNota = '';
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
}

// ===== Grabación =====

function actualizarRelojGrabacion() {
    const reloj = document.getElementById('nota-reloj');
    if (reloj && grabacion) reloj.textContent = textoDuracion((Date.now() - grabacion.inicio) / 1000);
}

async function iniciarGrabacion(libroId, ref) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        avisarNotas('Este dispositivo no permite grabar desde la app. Graba con Notas de Voz y usa "Adjuntar audio".', true);
        return;
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        avisarNotas('No hay permiso para usar el micrófono. Actívalo en Ajustes, o usa "Adjuntar audio".', true);
        return;
    }

    const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
    const trozos = [];

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) trozos.push(e.data);
    };
    recorder.onstop = async () => {
        const actual = grabacion;
        grabacion = null;
        clearInterval(actual.reloj);
        stream.getTracks().forEach(pista => pista.stop());

        const blob = new Blob(trozos, { type: recorder.mimeType || tipo || 'audio/mp4' });
        if (blob.size === 0) {
            avisarNotas('No se grabó nada. Inténtalo otra vez.', true);
        } else {
            try {
                await crearNotaConAudio(actual.libroId, blob, actual.ref, (Date.now() - actual.inicio) / 1000);
                avisarNotas('Audio guardado.');
            } catch (e) {
                avisarNotas('No se pudo guardar el audio en este dispositivo.', true);
            }
        }
        renderizarNotas(actual.libroId);
    };

    grabacion = { recorder, stream, trozos, inicio: Date.now(), libroId, ref, reloj: setInterval(actualizarRelojGrabacion, 500) };
    recorder.start();
    avisarNotas('');
}

function detenerGrabacion() {
    if (grabacion && grabacion.recorder.state !== 'inactive') grabacion.recorder.stop();
}

// ===== Acciones =====

function soltarAudioSonando() {
    if (audioSonando) URL.revokeObjectURL(audioSonando.url);
    audioSonando = null;
}

async function copiarTexto(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch (e) {
        return false;
    }
}

async function compartirAudio(libro, nota) {
    const registro = await leerAudio(nota.audio.id);
    if (!registro) {
        avisarNotas('No se encontró el audio en este dispositivo.', true);
        return;
    }
    const titulo = libro.titulo.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
    const nombre = `nota_${titulo}_${nota.fecha}_${nota.id}.${extensionAudio(registro.blob.type || nota.audio.tipo)}`;
    const archivo = new File([registro.blob], nombre, { type: registro.blob.type || nota.audio.tipo });

    try {
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
            await navigator.share({ files: [archivo], title: nombre });
            avisarNotas('Audio compartido.');
            return;
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return;
    }

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avisarNotas(`Audio guardado como ${nombre}.`);
}

async function alHacerClicNotas(e) {
    const boton = e.target.closest('[data-nota-acc]');
    if (!boton || !panelLibro || !panelLibro.id) return;

    const libroId = panelLibro.id;
    const libro = libroPorId(libroId);
    const accion = boton.dataset.notaAcc;
    const elemento = boton.closest('[data-nota]');
    const nota = elemento ? getNotas().find(n => n.id === Number(elemento.dataset.nota)) : null;
    const refActual = () => (document.getElementById('nota-ref') || {}).value || '';

    if (accion === 'guardar') {
        if (!borradorNota.trim()) {
            avisarNotas('Escribe algo antes de guardar la nota.', true);
        } else {
            crearNota(libroId, borradorNota, refActual());
            borradorNota = '';
            avisarNotas('Nota guardada.');
        }
    } else if (accion === 'grabar') {
        await iniciarGrabacion(libroId, refActual());
    } else if (accion === 'detener') {
        detenerGrabacion();
        return; // se redibuja cuando termina de guardar
    } else if (accion === 'copiar-todas') {
        const texto = textoDeTodasLasNotas(libro);
        avisarNotas(await copiarTexto(texto)
            ? 'Notas copiadas. Pégalas donde quieras guardarlas.'
            : 'No se pudo copiar automáticamente en este dispositivo.', false);
    } else if (nota) {
        if (accion === 'editar') {
            editandoNota = nota.id;
        } else if (accion === 'cancelar-edicion') {
            editandoNota = null;
        } else if (accion === 'guardar-edicion') {
            nota.texto = document.getElementById('nota-edit-texto').value.trim();
            nota.ref = document.getElementById('nota-edit-ref').value.trim();
            editandoNota = null;
            guardarDatosLibros();
            avisarNotas('Nota actualizada.');
        } else if (accion === 'escuchar') {
            const registro = await leerAudio(nota.audio.id).catch(() => null);
            if (!registro) {
                avisarNotas('No se encontró el audio en este dispositivo.', true);
            } else {
                soltarAudioSonando();
                audioSonando = { notaId: nota.id, url: URL.createObjectURL(registro.blob) };
            }
        } else if (accion === 'compartir') {
            await compartirAudio(libro, nota);
        } else if (accion === 'borrar-audio') {
            const aviso = nota.texto
                ? '¿Borrar el audio? El texto de la nota se conserva.'
                : '¿Borrar el audio? Esta nota aún no tiene texto, así que se borrará completa.';
            if (!confirm(aviso)) return;
            if (audioSonando && audioSonando.notaId === nota.id) soltarAudioSonando();
            await borrarAudio(nota.audio.id).catch(() => { });
            nota.audio = null;
            if (!nota.texto) getDatosLibros().notas = getNotas().filter(n => n.id !== nota.id);
            guardarDatosLibros();
            avisarNotas('Audio borrado.');
        } else if (accion === 'borrar') {
            if (!confirm('¿Borrar esta nota? No se puede deshacer.')) return;
            if (audioSonando && audioSonando.notaId === nota.id) soltarAudioSonando();
            if (nota.audio && nota.audio.equipo === getEquipo().id) await borrarAudio(nota.audio.id).catch(() => { });
            getDatosLibros().notas = getNotas().filter(n => n.id !== nota.id);
            guardarDatosLibros();
            avisarNotas('Nota borrada.');
        }
    }
    renderizarNotas(libroId);
}

async function alElegirAudio(e) {
    if (e.target.id !== 'nota-audio-input' || !panelLibro || !panelLibro.id) return;
    const archivo = e.target.files[0];
    const libroId = panelLibro.id;
    if (!archivo) return;
    const ref = (document.getElementById('nota-ref') || {}).value || '';
    try {
        await crearNotaConAudio(libroId, archivo, ref, 0);
        avisarNotas('Audio adjuntado.');
    } catch (err) {
        avisarNotas('No se pudo guardar el audio en este dispositivo.', true);
    }
    renderizarNotas(libroId);
}

// Al cerrar la ficha: guarda la grabación en curso y suelta el audio que sonaba
function alCerrarFichaNotas() {
    detenerGrabacion();
    soltarAudioSonando();
    editandoNota = null;
    borradorNota = '';
    avisarNotas('');
}

function iniciarNotas() {
    const cuerpo = document.getElementById('libro-body');
    cuerpo.addEventListener('click', alHacerClicNotas);
    cuerpo.addEventListener('change', alElegirAudio);
    cuerpo.addEventListener('input', (e) => {
        if (e.target.id === 'nota-texto') borradorNota = e.target.value;
    });
}
