/**
 * Sincronización entre equipos usando un repositorio privado de GitHub.
 *
 * Los datos (marcas, planes, libros, historial y notas) se guardan en un archivo
 * del repositorio. Cada elemento lleva la hora de su último cambio; al sincronizar
 * se combinan los de este equipo con los del repositorio y gana el más reciente,
 * elemento por elemento. Lo borrado se recuerda para que no "resucite".
 * Las fotos y los audios no se sincronizan.
 *
 * La llave de acceso se guarda solo en este equipo y nunca sale en el respaldo.
 */

const SYNC_CFG_KEY = 'lecturaBiblica_syncConfig';   // { repo, token, api }
const SYNC_T_KEY = 'lecturaBiblica_syncT';          // hora del último cambio de cada elemento
const SYNC_ULTIMA_KEY = 'lecturaBiblica_syncUltima';
const SYNC_ARCHIVO = 'datos.json';
const SYNC_API = 'https://api.github.com';
const COLECCIONES = ['marcas', 'planes', 'libros', 'registro', 'notas'];

let syncT = null;            // { coleccion: { id: hora } }
let syncFoto = null;         // cómo estaba cada elemento la última vez que se revisó
let syncAplicando = false;   // true mientras se escriben datos que vinieron de otro equipo
let syncEnCurso = false;
let syncPendiente = false;
let syncTemporizador = null;
let syncEstado = { tipo: 'inactivo', mensaje: '' }; // inactivo | sincronizando | ok | error | sin-conexion

// ===== Configuración =====

function getSyncConfig() {
    try {
        const cfg = JSON.parse(localStorage.getItem(SYNC_CFG_KEY));
        return cfg && cfg.repo && cfg.token ? cfg : null;
    } catch (e) {
        return null;
    }
}

function esEntornoDePruebas() {
    return ['localhost', '127.0.0.1'].includes(location.hostname);
}

// En github.io se puede adivinar el repositorio de datos a partir del usuario
function repoSugerido() {
    const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    return m ? `${m[1]}/lectura-biblica-datos` : '';
}

// ===== Estado local como colecciones { id: datos } =====

function leerEstadoLocal() {
    const datos = getDatosLibros();
    const porId = lista => Object.fromEntries(lista.map(item => [item.id, item]));
    const marcas = {};
    Object.keys(getCompletadas()).forEach(clave => { marcas[clave] = 1; });
    return {
        marcas,
        planes: { ...getPlanes() },
        libros: porId(datos.libros),
        registro: porId(datos.registro),
        notas: porId(datos.notas || [])
    };
}

function tomarFoto(estado) {
    const foto = {};
    for (const col of COLECCIONES) {
        foto[col] = {};
        for (const id of Object.keys(estado[col])) foto[col][id] = JSON.stringify(estado[col][id]);
    }
    return foto;
}

function cargarSyncT() {
    let t = null;
    try {
        t = JSON.parse(localStorage.getItem(SYNC_T_KEY));
    } catch (e) { }
    if (!t || typeof t !== 'object') t = {};
    for (const col of COLECCIONES) {
        if (!t[col] || typeof t[col] !== 'object') t[col] = {};
    }
    return t;
}

// Compara con la última foto y anota la hora en lo que cambió, se creó o se borró
function detectarCambiosLocales() {
    const estado = leerEstadoLocal();
    const foto = tomarFoto(estado);
    const ahora = Date.now();
    let hubo = false;

    for (const col of COLECCIONES) {
        const ids = new Set([...Object.keys(foto[col]), ...Object.keys(syncFoto[col])]);
        for (const id of ids) {
            if (foto[col][id] !== syncFoto[col][id]) {
                syncT[col][id] = ahora;
                hubo = true;
            }
        }
    }
    syncFoto = foto;
    if (hubo) localStorage.setItem(SYNC_T_KEY, JSON.stringify(syncT));
    return hubo;
}

// Lo llama el resto de la app cada vez que guarda algo
function alCambiarDatosLocales() {
    if (syncAplicando || !syncFoto) return;
    if (detectarCambiosLocales() && getSyncConfig()) programarSync(2500);
}

// ===== Combinar =====

// Estado con horas: { coleccion: { id: { t, d } } }, donde d = null significa "borrado"
function construirLocal() {
    const estado = leerEstadoLocal();
    const completo = {};
    for (const col of COLECCIONES) {
        completo[col] = {};
        const ids = new Set([...Object.keys(estado[col]), ...Object.keys(syncT[col])]);
        for (const id of ids) {
            completo[col][id] = { t: syncT[col][id] || 0, d: estado[col][id] === undefined ? null : estado[col][id] };
        }
    }
    return completo;
}

function limpiarRemoto(datos) {
    const limpio = {};
    for (const col of COLECCIONES) {
        limpio[col] = {};
        const origen = datos && typeof datos[col] === 'object' && datos[col] ? datos[col] : {};
        for (const id of Object.keys(origen)) {
            const item = origen[id];
            if (!item || typeof item !== 'object') continue;
            const t = Number(item.t);
            limpio[col][id] = { t: Number.isFinite(t) ? t : 0, d: item.d === undefined ? null : item.d };
        }
    }
    return limpio;
}

// Gana el cambio más reciente de cada elemento; en empate se queda lo de este equipo
function fusionar(local, remoto) {
    const resultado = {};
    for (const col of COLECCIONES) {
        resultado[col] = {};
        const ids = new Set([...Object.keys(local[col]), ...Object.keys(remoto[col])]);
        for (const id of ids) {
            const l = local[col][id];
            const r = remoto[col][id];
            resultado[col][id] = !l ? r : (!r ? l : (r.t > l.t ? r : l));
        }
    }
    return resultado;
}

// Texto único para comparar dos estados sin que importe el orden
function huella(estado) {
    return JSON.stringify(COLECCIONES.map(col =>
        Object.keys(estado[col]).sort().map(id => [id, estado[col][id].t, JSON.stringify(estado[col][id].d)])
    ));
}

// Escribe en este equipo el resultado de combinar
function aplicarEstado(estado) {
    syncAplicando = true;
    try {
        const vivos = col => Object.keys(estado[col]).filter(id => estado[col][id].d !== null);

        const completadas = {};
        vivos('marcas').forEach(clave => { completadas[clave] = true; });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(completadas));

        const planes = {};
        vivos('planes').forEach(año => {
            if (planValido(estado.planes[año].d)) planes[año] = estado.planes[año].d;
        });
        guardarPlanes(planes);

        const datos = getDatosLibros();
        const lista = col => vivos(col).map(id => estado[col][id].d)
            .filter(item => item && typeof item === 'object' && item.id !== undefined)
            .sort((a, b) => a.id - b.id);
        datos.libros = lista('libros').map(normalizarLibro);
        datos.registro = lista('registro');
        datos.notas = lista('notas');
        guardarDatosLibros();

        for (const col of COLECCIONES) {
            syncT[col] = {};
            for (const id of Object.keys(estado[col])) syncT[col][id] = estado[col][id].t;
        }
        localStorage.setItem(SYNC_T_KEY, JSON.stringify(syncT));
        syncFoto = tomarFoto(leerEstadoLocal());
    } finally {
        syncAplicando = false;
    }

    // Redibuja lo que está a la vista (sin tocar una ficha que se esté editando)
    generarCalendario();
    renderizarLecturas();
    renderizarLibros();
    actualizarInfoRespaldo();
    if (panelLibro && panelLibro.id && !libroPorId(panelLibro.id)) cerrarPanelLibro();
    limpiarArchivosHuerfanos();
}

// ===== GitHub =====

function aBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binario);
}

function deBase64(base64) {
    const binario = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function errorSync(mensaje, tipo) {
    const error = new Error(mensaje);
    error.tipo = tipo || 'error';
    return error;
}

async function pedirGitHub(cfg, ruta, opciones) {
    let respuesta;
    try {
        respuesta = await fetch(`${cfg.api || SYNC_API}${ruta}`, {
            ...opciones,
            cache: 'no-store',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${cfg.token}`,
                ...(opciones && opciones.body ? { 'Content-Type': 'application/json' } : {})
            }
        });
    } catch (e) {
        throw errorSync('No hay conexión con GitHub.', 'sin-conexion');
    }
    if (respuesta.status === 401) throw errorSync('La llave no es válida o ya venció. Crea una nueva y vuelve a conectar.', 'acceso');
    if (respuesta.status === 403) throw errorSync('GitHub rechazó el acceso: revisa que la llave tenga permiso de "Contents: Read and write".', 'acceso');
    return respuesta;
}

async function leerRemoto(cfg) {
    const respuesta = await pedirGitHub(cfg, `/repos/${cfg.repo}/contents/${SYNC_ARCHIVO}`);
    if (respuesta.status === 404) return null; // todavía no hay archivo (o no hay acceso: se sabrá al escribir)
    if (!respuesta.ok) throw errorSync(`GitHub respondió con un error (${respuesta.status}).`);

    const info = await respuesta.json();
    let base64 = info.content;
    if (!base64) {
        // Archivos de más de 1 MB: hay que pedir el contenido aparte
        const blob = await pedirGitHub(cfg, `/repos/${cfg.repo}/git/blobs/${info.sha}`);
        if (!blob.ok) throw errorSync(`GitHub respondió con un error (${blob.status}).`);
        base64 = (await blob.json()).content;
    }

    let archivo;
    try {
        archivo = JSON.parse(deBase64(base64));
    } catch (e) {
        throw errorSync('El archivo de datos del repositorio está dañado.');
    }
    return { sha: info.sha, datos: limpiarRemoto(archivo.datos) };
}

async function escribirRemoto(cfg, estado, sha) {
    const archivo = {
        app: 'lecturaBiblica',
        formato: 1,
        actualizado: new Date().toISOString(),
        equipo: getEquipo().nombre,
        datos: estado
    };
    const respuesta = await pedirGitHub(cfg, `/repos/${cfg.repo}/contents/${SYNC_ARCHIVO}`, {
        method: 'PUT',
        body: JSON.stringify({
            message: `Sincronización desde ${getEquipo().nombre}`,
            content: aBase64(JSON.stringify(archivo)),
            ...(sha ? { sha } : {})
        })
    });
    if (respuesta.status === 409 || respuesta.status === 422) throw errorSync('Otro equipo guardó al mismo tiempo.', 'conflicto');
    if (respuesta.status === 404) throw errorSync('No encuentro el repositorio, o la llave no tiene acceso a él.', 'acceso');
    if (!respuesta.ok) throw errorSync(`GitHub respondió con un error (${respuesta.status}).`);
}

// ===== Sincronizar =====

function programarSync(espera) {
    clearTimeout(syncTemporizador);
    syncTemporizador = setTimeout(() => sincronizar(), espera);
}

async function sincronizar() {
    const cfg = getSyncConfig();
    if (!cfg || !syncFoto) return false;
    if (syncEnCurso) {
        syncPendiente = true;
        return false;
    }
    if (navigator.onLine === false) {
        ponerEstadoSync('sin-conexion', 'Sin conexión: se sincronizará al volver internet.');
        return false;
    }

    syncEnCurso = true;
    ponerEstadoSync('sincronizando', 'Sincronizando…');
    let exito = false;

    try {
        for (let intento = 0; intento < 4 && !exito; intento++) {
            const remoto = await leerRemoto(cfg);

            // Desde aquí hasta aplicar no hay esperas: nada puede cambiar en medio
            detectarCambiosLocales();
            const local = construirLocal();
            const combinado = remoto ? fusionar(local, remoto.datos) : local;
            const huellaCombinado = huella(combinado);
            if (huellaCombinado !== huella(local)) aplicarEstado(combinado);

            if (!remoto || huellaCombinado !== huella(remoto.datos)) {
                try {
                    await escribirRemoto(cfg, combinado, remoto ? remoto.sha : null);
                } catch (e) {
                    if (e.tipo === 'conflicto' && intento < 3) continue; // otro equipo se adelantó: se repite
                    throw e;
                }
            }
            exito = true;
        }
        localStorage.setItem(SYNC_ULTIMA_KEY, String(Date.now()));
        ponerEstadoSync('ok', '');
    } catch (e) {
        ponerEstadoSync(e.tipo === 'sin-conexion' ? 'sin-conexion' : 'error', e.message || 'No se pudo sincronizar.', e.tipo);
    } finally {
        syncEnCurso = false;
        if (syncPendiente) {
            syncPendiente = false;
            programarSync(800);
        }
    }
    return exito;
}

// ===== Pantalla =====

function textoUltimaSync() {
    const ultima = Number(localStorage.getItem(SYNC_ULTIMA_KEY));
    if (!ultima) return 'Aún no se ha sincronizado.';
    const fecha = new Date(ultima);
    const hoy = new Date();
    const hora = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const mismoDia = fecha.toDateString() === hoy.toDateString();
    return `Última sincronización: ${mismoDia ? 'hoy' : fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} a las ${hora}.`;
}

function ponerEstadoSync(tipo, mensaje, detalle) {
    syncEstado = { tipo, mensaje, detalle };
    renderizarSync();
}

function renderizarSync() {
    const cuerpo = document.getElementById('sync-body');
    const chip = document.getElementById('sync-chip');
    if (!cuerpo) return;
    const cfg = getSyncConfig();

    // Indicador pequeño bajo la fecha
    chip.hidden = !cfg;
    if (cfg) {
        const textos = {
            sincronizando: '🔄 Sincronizando…',
            ok: `🔄 ${textoUltimaSync().replace('Última sincronización: ', 'Sincronizado ').replace(/\.$/, '')}`,
            'sin-conexion': '⚠️ Sin conexión: cambios guardados solo aquí por ahora',
            error: '⚠️ No se pudo sincronizar (mira abajo, en Sincronización)',
            inactivo: '🔄 Sincronización activada'
        };
        chip.textContent = textos[syncEstado.tipo] || '';
        chip.classList.toggle('error', syncEstado.tipo === 'error' || syncEstado.tipo === 'sin-conexion');
    }

    // No redibujar el formulario mientras se está escribiendo en él
    if (!cfg && cuerpo.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
        const estado = cuerpo.querySelector('.backup-status');
        if (estado) {
            estado.textContent = syncEstado.mensaje;
            estado.classList.toggle('error', syncEstado.tipo === 'error');
        }
        return;
    }

    if (cfg) {
        const esError = syncEstado.tipo === 'error' || syncEstado.tipo === 'sin-conexion';
        cuerpo.innerHTML = `
            <p>Conectado a <strong>${esc(cfg.repo)}</strong> como <strong>${esc(getEquipo().nombre)}</strong>.</p>
            <p>${textoUltimaSync()}</p>
            <p class="cfg-hint">Se sincronizan las marcas, el plan, los libros con su avance y las notas.
                Las fotos y los audios se quedan en el equipo donde los subiste.</p>
            <div class="backup-actions">
                <button type="button" class="backup-btn" data-sync-acc="ahora">Sincronizar ahora</button>
                <button type="button" class="backup-btn" data-sync-acc="desconectar">Desconectar este equipo</button>
            </div>
            <p class="backup-status ${esError ? 'error' : ''}" role="status" aria-live="polite">${esc(syncEstado.mensaje)}</p>
        `;
    } else {
        cuerpo.innerHTML = `
            <p>Conecta este equipo a tu repositorio privado de GitHub para ver y actualizar lo mismo
                en el iPhone, el iPad y la Mac.</p>
            <label>Repositorio de datos (usuario/nombre)
                <input type="text" id="sync-repo" value="${esc(repoSugerido())}" autocapitalize="off"
                    autocomplete="off" spellcheck="false" placeholder="usuario/lectura-biblica-datos">
            </label>
            <label>Llave de acceso (token de GitHub)
                <input type="password" id="sync-token" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
            </label>
            ${esEntornoDePruebas() ? `<label>Servidor (solo para pruebas)
                <input type="text" id="sync-api" autocomplete="off" spellcheck="false" placeholder="${SYNC_API}">
            </label>` : ''}
            <div class="backup-actions">
                <button type="button" class="backup-btn nota-principal" data-sync-acc="conectar">Conectar</button>
            </div>
            <p class="cfg-hint">La llave se guarda solo en este equipo y no se incluye en el respaldo.</p>
            <p class="backup-status ${syncEstado.tipo === 'error' ? 'error' : ''}" role="status" aria-live="polite">${esc(syncEstado.mensaje)}</p>
        `;
    }
}

async function conectarSync() {
    const repo = document.getElementById('sync-repo').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const token = document.getElementById('sync-token').value.trim();
    const campoApi = document.getElementById('sync-api');
    const api = campoApi && campoApi.value.trim() ? campoApi.value.trim().replace(/\/$/, '') : '';

    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        ponerEstadoSync('error', 'Escribe el repositorio como usuario/nombre, por ejemplo: miusuario/lectura-biblica-datos.');
        return;
    }
    if (!token) {
        ponerEstadoSync('error', 'Pega la llave de acceso.');
        return;
    }

    localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(api ? { repo, token, api } : { repo, token }));
    document.activeElement && document.activeElement.blur();
    const exito = await sincronizar();

    // Si la llave o el repositorio no sirven, no se deja este equipo a medio conectar
    if (!exito && syncEstado.detalle === 'acceso') {
        const mensaje = syncEstado.mensaje;
        localStorage.removeItem(SYNC_CFG_KEY);
        ponerEstadoSync('error', mensaje);
    }
}

function desconectarSync() {
    if (!confirm('¿Desconectar este equipo? Tus datos se quedan aquí, pero dejarán de sincronizarse. La llave se borra de este equipo.')) return;
    clearTimeout(syncTemporizador);
    localStorage.removeItem(SYNC_CFG_KEY);
    localStorage.removeItem(SYNC_ULTIMA_KEY);
    ponerEstadoSync('inactivo', 'Equipo desconectado.');
}

function iniciarSync() {
    syncT = cargarSyncT();
    syncFoto = tomarFoto(leerEstadoLocal());

    document.getElementById('sync-body').addEventListener('click', (e) => {
        const boton = e.target.closest('[data-sync-acc]');
        if (!boton) return;
        const accion = boton.dataset.syncAcc;
        if (accion === 'conectar') conectarSync();
        else if (accion === 'ahora') sincronizar();
        else if (accion === 'desconectar') desconectarSync();
    });

    renderizarSync();
    if (!getSyncConfig()) return;

    sincronizar();
    // Al volver a la app o recuperar internet, trae lo que cambió en otros equipos
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') programarSync(300);
    });
    window.addEventListener('online', () => programarSync(300));
}
