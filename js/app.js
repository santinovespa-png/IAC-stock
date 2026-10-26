/**
 * app.js — Lógica de la aplicación de gestión de stock de IAC INTERNACIONAL SRL.
 *
 * Aplicación de una sola página. Los datos los administra js/datos.js, que
 * según esté configurado o no Supabase trabaja contra la nube (compartido
 * entre dispositivos) o contra el navegador (sólo local).
 *
 * EL STOCK SE MANEJA SIEMPRE EN UNIDADES. La presentación (unidades por caja)
 * se usa únicamente para calcular precios y para mostrar la equivalencia en
 * cajas como dato secundario.
 *
 * Organización del archivo:
 *   1.  Constantes y estado
 *   2.  Arranque, sesión y carga de datos
 *   3.  Utilidades de formato y de DOM
 *   4.  Cálculo de precios y métricas
 *   5.  Notificaciones (toasts)
 *   6.  Modales
 *   7.  Vista: Dashboard
 *   8.  Vista: Productos
 *   9.  ABM de productos
 *   10. Movimientos de stock (modal, edición en línea y carga rápida)
 *   11. Exportaciones e importación
 *   12. Vista: Configuración
 *   13. Navegación, tema y eventos
 */

'use strict';

(function () {

  /* ===================== 1. CONSTANTES Y ESTADO ========================= */

  const THEME_KEY = 'iac_tema';
  const PAGE_SIZE = 20;

  const FAMILIA_NOMBRE = FAMILIAS.reduce(function (acc, f) {
    acc[f.codigo] = f.nombre;
    return acc;
  }, {});

  /** Estado de datos en memoria. */
  let state = { config: configPorDefecto(), productos: [] };

  /** Estado de interfaz (no se guarda). */
  const ui = {
    vista: 'dashboard',
    busqueda: '',
    familia: '',
    sistema: '',
    stock: 'todos',
    sortKey: null,
    sortDir: 'asc',
    pagina: 1,
    chartDim: 'familia',
    chartMetric: 'productos',
    chartTablaVisible: false,
    editandoId: null,
    stockId: null,
    chartAnchoRenderizado: 0,
    // Carga rápida
    cargaProductoId: null,
    cargaModo: 'fijar',
    cargaSugerenciaActiva: -1,
    cargaLog: [],
    // Edición en línea del stock
    editandoStockId: null,
    ocupado: false
  };

  function configPorDefecto() {
    return {
      tipoCambio: TIPO_CAMBIO_DEFAULT,
      stockMinimoDefault: STOCK_MINIMO_DEFAULT,
      unidadMedida: 'UNIDAD',
      csvColumnaLote: 'NRO_LOTE',
      csvDelimitador: ';'
    };
  }

  function nuevoId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    // Respaldo con forma de UUID v4, porque la columna en Supabase es uuid.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function enteroPositivo(v, min, porDefecto) {
    const n = Math.trunc(Number(v));
    if (!isFinite(n) || n < min) return porDefecto;
    return n;
  }

  function numeroNoNegativo(v, porDefecto) {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return porDefecto;
    return n;
  }

  /**
   * Lleva cualquier registro (catálogo inicial, formulario, backup, nube) al
   * formato interno. Devuelve null si le faltan los datos mínimos.
   */
  function normalizarProducto(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const codigo = String(raw.codigo == null ? '' : raw.codigo).trim();
    const descripcion = String(raw.descripcion == null ? '' : raw.descripcion).trim();
    if (!codigo || !descripcion) return null;

    const familia = String(raw.familia == null ? '' : raw.familia).trim().toUpperCase();
    const sistema = String(raw.sistema == null ? '' : raw.sistema).trim();

    return {
      id: raw.id ? String(raw.id) : nuevoId(),
      familia: FAMILIA_NOMBRE[familia] ? familia : FAMILIAS[0].codigo,
      codigo: codigo,
      descripcion: descripcion,
      sistema: SISTEMAS.indexOf(sistema) !== -1 ? sistema : (sistema || SISTEMAS[0]),
      presentacion_caja: enteroPositivo(raw.presentacion_caja, 1, 1),
      precio_usd: numeroNoNegativo(raw.precio_usd, 0),
      stock: enteroPositivo(raw.stock, 0, 0),
      stock_minimo: enteroPositivo(raw.stock_minimo, 0, STOCK_MINIMO_DEFAULT),
      lote: String(raw.lote == null ? '' : raw.lote).trim().slice(0, 40),
      observaciones: String(raw.observaciones == null ? '' : raw.observaciones).slice(0, 500),
      ultimo_movimiento: raw.ultimo_movimiento ? String(raw.ultimo_movimiento) : null,
      ultimo_movimiento_detalle: raw.ultimo_movimiento_detalle
        ? String(raw.ultimo_movimiento_detalle) : null,
      actualizado_por: raw.actualizado_por || null,
      creado: raw.creado ? String(raw.creado) : new Date().toISOString(),
      actualizado: raw.actualizado ? String(raw.actualizado) : new Date().toISOString()
    };
  }

  function normalizarConfig(raw) {
    const def = configPorDefecto();
    if (!raw || typeof raw !== 'object') return def;

    const tc = Number(raw.tipoCambio);
    const delim = String(raw.csvDelimitador == null ? '' : raw.csvDelimitador);

    return {
      tipoCambio: isFinite(tc) && tc > 0 ? tc : def.tipoCambio,
      stockMinimoDefault: enteroPositivo(raw.stockMinimoDefault, 0, def.stockMinimoDefault),
      unidadMedida: (String(raw.unidadMedida == null ? '' : raw.unidadMedida).trim()
        || def.unidadMedida).slice(0, 20),
      csvColumnaLote: (String(raw.csvColumnaLote == null ? '' : raw.csvColumnaLote).trim()
        || def.csvColumnaLote).slice(0, 30),
      csvDelimitador: [';', ',', '\t'].indexOf(delim) !== -1 ? delim : def.csvDelimitador
    };
  }

  /** Catálogo de fábrica: 128 productos con el stock en 0 unidades. */
  function catalogoInicial() {
    return PRODUCTOS_INICIALES.map(function (p) {
      return normalizarProducto({
        familia: p.familia,
        codigo: p.codigo,
        descripcion: p.descripcion,
        sistema: p.sistema,
        presentacion_caja: p.presentacion_caja,
        precio_usd: p.precio_usd,
        stock: 0,
        stock_minimo: STOCK_MINIMO_DEFAULT,
        lote: '',
        observaciones: ''
      });
    }).filter(Boolean);
  }

  /* ============ 2. ARRANQUE, SESIÓN Y CARGA DE DATOS ==================== */

  const $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  const $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  function mostrarSplash(texto) {
    const s = $('#splash');
    if (texto) $('#splash-texto').textContent = texto;
    s.hidden = false;
  }

  function ocultarSplash() { $('#splash').hidden = true; }

  /** Punto de entrada. */
  async function init() {
    aplicarTema(temaEfectivo());
    conectarEventosBase();

    mostrarSplash('Conectando…');

    let arranque;
    try {
      arranque = await Datos.iniciar();
    } catch (e) {
      arranque = { modo: 'local', usuario: null, error: e.message };
    }

    if (arranque.error) {
      avisoSync('error', esc(arranque.error), 'arranque');
    }

    if (arranque.habiaV1) {
      // La versión anterior contaba el stock en cajas. Como ahora son unidades,
      // reinterpretarlo sería inventar números: se descarta y se avisa.
      avisoSync('warning',
        'El stock ahora se cuenta en <strong>unidades</strong>, no en cajas. ' +
        'Los datos de la versión anterior se descartaron para no mezclar criterios: ' +
        'todos los productos arrancan en 0 y hay que cargar las unidades reales.',
        'migracion-v1');
    }

    if (Datos.necesitaSesion()) {
      ocultarSplash();
      mostrarLogin();
      return;
    }

    await arrancarApp();
  }

  /** Carga los datos y muestra la aplicación. Se usa al entrar y tras el login. */
  async function arrancarApp() {
    mostrarSplash('Cargando el catálogo…');
    $('#login').hidden = true;

    try {
      await cargarDatos();
    } catch (e) {
      ocultarSplash();
      $('#app').hidden = false;
      avisoSync('error', 'No se pudieron cargar los datos: ' + esc(e.message));
      toast('error', 'Error al cargar', e.message);
      return;
    }

    $('#app').hidden = false;
    ocultarSplash();

    sincronizarFiltrosForm();
    sincronizarConfigForm();
    conectarEventosApp();
    actualizarCabeceraSesion();
    navegar('dashboard');
    renderTodo();

    if (Datos.modo() === 'nube') {
      Datos.suscribirCambios(alCambiarEnLaNube);
      avisoSync('ok',
        'Sincronización activa: los cambios que hagas acá aparecen al instante ' +
        'en los demás dispositivos.', 'modo');
      refrescarHistorial();
    } else {
      avisoSync('warning',
        'Modo local: los datos se guardan sólo en este dispositivo y no se ' +
        'comparten con el celular ni con otras computadoras. ' +
        'Para activar la sincronización hay que completar <code>js/config.js</code>.',
        'modo');
    }
  }

  /** Trae los datos desde donde corresponda y los deja en memoria. */
  async function cargarDatos() {
    if (Datos.modo() === 'nube') {
      const remoto = await Datos.cargarTodo();

      state.config = remoto.config ? normalizarConfig(remoto.config) : configPorDefecto();
      state.productos = remoto.productos.map(normalizarProducto).filter(Boolean);

      if (!state.productos.length) {
        // Base recién creada: se ofrece cargar el catálogo de fábrica.
        await ofrecerSembrarCatalogo();
      }

      Datos.escribirCache(state);
      return;
    }

    // Modo local
    const cache = Datos.leerCache();
    if (cache && Array.isArray(cache.productos) && cache.productos.length) {
      state.config = normalizarConfig(cache.config);
      state.productos = cache.productos.map(normalizarProducto).filter(Boolean);
    } else {
      state.config = configPorDefecto();
      state.productos = catalogoInicial();
      Datos.escribirCache(state);
    }
  }

  /** Primera vez contra una base vacía: pregunta si carga los 128 productos. */
  async function ofrecerSembrarCatalogo() {
    ocultarSplash();
    $('#app').hidden = false;

    const ok = await confirmar({
      titulo: 'Base de datos vacía',
      okTexto: 'Sí, cargar el catálogo',
      okIcono: 'fa-cloud-arrow-up',
      okClase: 'btn',
      html:
        '<div class="callout callout--info">' +
          '<i class="fa-solid fa-database" aria-hidden="true"></i>' +
          '<div>Tu base en Supabase está vacía. ¿Querés cargar los ' +
          '<strong>' + PRODUCTOS_INICIALES.length + ' productos</strong> del catálogo, ' +
          'todos con el stock en <strong>0 unidades</strong>?<br><br>' +
          'Esto se hace una sola vez y después queda compartido entre todos los ' +
          'dispositivos.</div>' +
        '</div>'
    });

    if (!ok) {
      state.productos = [];
      return;
    }

    mostrarSplash('Cargando 128 productos en la nube…');
    const nuevos = catalogoInicial();

    try {
      await Datos.sembrarCatalogo(nuevos);
      state.productos = nuevos;
      toast('success', 'Catálogo cargado',
        nuevos.length + ' productos disponibles en todos los dispositivos.');
    } catch (e) {
      state.productos = [];
      toast('error', 'No se pudo cargar el catálogo', e.message);
    }
  }

  /** Alguien cambió algo desde otro dispositivo. */
  const alCambiarEnLaNube = debounce(async function () {
    // Si el usuario está escribiendo un stock en línea, se espera: pisarle el
    // campo mientras tipea sería peor que demorar la actualización.
    if (ui.editandoStockId || ui.ocupado) {
      setTimeout(alCambiarEnLaNube, 1500);
      return;
    }

    try {
      const remoto = await Datos.cargarTodo();
      if (!remoto) return;

      state.config = remoto.config ? normalizarConfig(remoto.config) : state.config;
      state.productos = remoto.productos.map(normalizarProducto).filter(Boolean);
      Datos.escribirCache(state);

      sincronizarConfigForm();
      renderTodo();
      if (ui.vista === 'carga') refrescarSeleccionCarga();
    } catch (e) { /* si falla, queda lo que hay en pantalla */ }
  }, 400);

  /* ---------------------------- Sesión ---------------------------------- */

  function mostrarLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-error').hidden = true;
    setTimeout(function () { $('#login-email').focus(); }, 60);
  }

  function actualizarCabeceraSesion() {
    const u = Datos.usuarioActual();
    const cont = $('#header-user');

    if (u) {
      cont.hidden = false;
      $('#header-user-email').textContent = u.email || 'Sesión iniciada';
      $('#header-user-email').title = u.email || '';
    } else {
      cont.hidden = true;
    }

    $('#card-historial').hidden = Datos.modo() !== 'nube';
  }

  async function hacerLogin(ev) {
    ev.preventDefault();

    const btn = $('#btn-login');
    const err = $('#login-error');
    const email = $('#login-email').value.trim();
    const pass = $('#login-pass').value;

    err.hidden = true;

    if (!email || !pass) {
      err.hidden = false;
      $('span', err).textContent = 'Completá el correo y la contraseña.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Ingresando…';

    try {
      await Datos.iniciarSesion(email, pass);
      $('#login-pass').value = '';
      await arrancarApp();
    } catch (e) {
      err.hidden = false;
      $('span', err).textContent = e.message;
      $('#login-pass').select();
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Ingresar';
    }
  }

  async function hacerLogout() {
    const ok = await confirmar({
      titulo: 'Cerrar sesión',
      okTexto: 'Sí, cerrar sesión',
      okIcono: 'fa-right-from-bracket',
      okClase: 'btn--danger',
      html: '<div class="callout callout--info">' +
            '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
            '<div>Los datos quedan guardados en la nube. Vas a poder volver a ' +
            'entrar con tu usuario desde cualquier dispositivo.</div></div>'
    });

    if (!ok) return;

    await Datos.cerrarSesion();
    state = { config: configPorDefecto(), productos: [] };
    mostrarLogin();
  }

  /*
   * Aviso fijo bajo el encabezado. Puede haber más de uno a la vez (por
   * ejemplo, "cambió el criterio a unidades" y "estás en modo local"), así que
   * se acumulan en una lista en lugar de pisarse entre sí.
   */
  const avisosActivos = [];

  const PESO_AVISO = { ok: 0, info: 1, warning: 2, error: 3 };

  /**
   * @param {'ok'|'info'|'warning'|'error'} tipo
   * @param {string} html
   * @param {string} [clave]  identifica el aviso para poder reemplazarlo
   */
  function avisoSync(tipo, html, clave) {
    const id = clave || tipo + ':' + html.slice(0, 40);
    const i = avisosActivos.findIndex(function (a) { return a.id === id; });
    const aviso = { id: id, tipo: tipo, html: html };

    if (i !== -1) avisosActivos[i] = aviso;
    else avisosActivos.push(aviso);

    renderAvisos();

    // El aviso de "todo bien" no necesita quedarse en pantalla.
    if (tipo === 'ok') {
      setTimeout(function () { quitarAviso(id); }, 6000);
    }
  }

  function quitarAviso(id) {
    const i = avisosActivos.findIndex(function (a) { return a.id === id; });
    if (i !== -1) { avisosActivos.splice(i, 1); renderAvisos(); }
  }

  function renderAvisos() {
    const b = $('#sync-banner');

    if (!avisosActivos.length) { b.hidden = true; return; }

    // El estilo lo marca el aviso más grave de los que estén activos.
    const peor = avisosActivos.reduce(function (acc, a) {
      return PESO_AVISO[a.tipo] > PESO_AVISO[acc.tipo] ? a : acc;
    }, avisosActivos[0]);

    b.className = 'sync-banner' +
      (peor.tipo === 'error' ? ' sync-banner--error'
        : peor.tipo === 'ok' ? ' sync-banner--ok' : '');

    $('#sync-banner-text').innerHTML = avisosActivos.map(function (a) {
      return '<div>' + a.html + '</div>';
    }).join('');

    b.hidden = false;
  }

  /* ================= 3. UTILIDADES DE FORMATO Y DOM ===================== */

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const nfEnteros = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const nfDecimales = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  function fmtEntero(n) { return nfEnteros.format(isFinite(n) ? n : 0); }
  function fmtDecimal(n) { return nfDecimales.format(isFinite(n) ? n : 0); }
  function fmtARS(n) { return 'AR$ ' + fmtDecimal(n); }
  function fmtUSD(n) { return 'US$ ' + fmtDecimal(n); }

  function fmtMontoCorto(n, prefijo) {
    const v = isFinite(n) ? n : 0;
    const abs = Math.abs(v);
    if (abs >= 1e12) return prefijo + ' ' + fmtDecimal(v / 1e12) + ' billones';
    if (abs >= 1e6) return prefijo + ' ' + fmtDecimal(v / 1e6) + ' millones';
    return prefijo + ' ' + fmtEntero(v);
  }

  function fmtMontoChart(n) {
    const v = isFinite(n) ? n : 0;
    const abs = Math.abs(v);
    if (abs >= 1e9) return fmtDecimal(v / 1e9) + ' MM';
    if (abs >= 1e6) return fmtDecimal(v / 1e6) + ' M';
    if (abs >= 1e3) return fmtEntero(v / 1e3) + ' k';
    return fmtEntero(v);
  }

  function fmtFecha(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtFechaHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function sufijoFecha() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  const colator = new Intl.Collator('es-AR', { sensitivity: 'base', numeric: true });

  function normalizarTexto(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ============== 4. CÁLCULO DE PRECIOS Y MÉTRICAS ====================== */

  function redondear2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  /** Unidades por caja, nunca menor que 1. */
  function presentacion(p) {
    return p.presentacion_caja > 0 ? p.presentacion_caja : 1;
  }

  function precioArsCaja(p) {
    return redondear2(p.precio_usd * state.config.tipoCambio);
  }

  function precioArsUnidad(p) {
    return redondear2(precioArsCaja(p) / presentacion(p));
  }

  function precioUsdUnidad(p) {
    return p.precio_usd / presentacion(p);
  }

  function esStockBajo(p) { return p.stock <= p.stock_minimo; }

  /** Valor del stock de un producto. El stock está en unidades. */
  function valorStock(p) {
    return {
      ars: redondear2(p.stock * precioArsUnidad(p)),
      usd: redondear2(p.stock * precioUsdUnidad(p))
    };
  }

  /**
   * Equivalencia en cajas de un stock en unidades, como dato secundario.
   * Devuelve '' cuando el producto se vende suelto (1 unidad por caja).
   */
  function equivalenciaCajas(p, unidades) {
    const pres = presentacion(p);
    if (pres <= 1) return '';

    const u = unidades == null ? p.stock : unidades;
    if (u <= 0) return '';

    const cajas = Math.floor(u / pres);
    const sueltas = u % pres;

    if (cajas === 0) return sueltas + ' u sueltas';
    if (sueltas === 0) return cajas + (cajas === 1 ? ' caja' : ' cajas');
    return cajas + (cajas === 1 ? ' caja' : ' cajas') + ' + ' + sueltas + ' u';
  }

  function totales() {
    let valorArs = 0, valorUsd = 0, unidades = 0, bajo = 0, cero = 0;

    state.productos.forEach(function (p) {
      valorArs += p.stock * precioArsUnidad(p);
      valorUsd += p.stock * precioUsdUnidad(p);
      unidades += p.stock;
      if (esStockBajo(p)) bajo++;
      if (p.stock === 0) cero++;
    });

    return {
      productos: state.productos.length,
      valorArs: redondear2(valorArs),
      valorUsd: redondear2(valorUsd),
      unidades: unidades,
      bajo: bajo,
      cero: cero
    };
  }

  function agrupar(dimension) {
    const mapa = new Map();

    state.productos.forEach(function (p) {
      const clave = dimension === 'familia' ? p.familia : p.sistema;
      let g = mapa.get(clave);
      if (!g) {
        g = {
          clave: clave,
          etiqueta: dimension === 'familia' ? (FAMILIA_NOMBRE[clave] || clave) : clave,
          sigla: dimension === 'familia' ? clave : '',
          productos: 0,
          unidades: 0,
          valor: 0
        };
        mapa.set(clave, g);
      }
      g.productos++;
      g.unidades += p.stock;
      g.valor += p.stock * precioArsUnidad(p);
    });

    const grupos = Array.from(mapa.values());
    grupos.forEach(function (g) { g.valor = redondear2(g.valor); });
    return grupos;
  }

  /* ====================== 5. NOTIFICACIONES ============================= */

  const ICONO_TOAST = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };

  function toast(tipo, titulo, mensaje) {
    const cont = $('#toasts');
    if (!cont) return;

    const el = document.createElement('div');
    el.className = 'toast toast--' + tipo;
    el.innerHTML =
      '<i class="fa-solid ' + (ICONO_TOAST[tipo] || ICONO_TOAST.info) + ' toast__icon" aria-hidden="true"></i>' +
      '<div class="toast__body">' +
        '<div class="toast__title">' + esc(titulo) + '</div>' +
        (mensaje ? '<div class="toast__msg">' + esc(mensaje) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="toast__close" aria-label="Cerrar notificación">' +
        '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
      '</button>';

    const quitar = function () {
      if (!el.parentNode) return;
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    };

    $('.toast__close', el).addEventListener('click', quitar);
    cont.appendChild(el);

    while (cont.children.length > 4) cont.removeChild(cont.firstChild);
    setTimeout(quitar, tipo === 'error' ? 7000 : 4200);
  }

  /* ========================== 6. MODALES ================================ */

  function abrirModal(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function cerrarModal(dlg, valor) {
    if (typeof dlg.close === 'function') dlg.close(valor || '');
    else dlg.removeAttribute('open');
  }

  function confirmar(opciones) {
    const dlg = $('#modal-confirm');
    const btnOk = $('#confirm-ok');

    $('#confirm-title').textContent = opciones.titulo || 'Confirmar';
    $('#confirm-body').innerHTML = opciones.html || '';
    btnOk.innerHTML =
      '<i class="fa-solid ' + (opciones.okIcono || 'fa-check') + '" aria-hidden="true"></i> ' +
      esc(opciones.okTexto || 'Confirmar');
    btnOk.className = 'btn ' + (opciones.okClase || 'btn--danger');

    return new Promise(function (resolve) {
      const alConfirmar = function () { cerrarModal(dlg, 'ok'); };
      const alCerrar = function () {
        btnOk.removeEventListener('click', alConfirmar);
        dlg.removeEventListener('close', alCerrar);
        resolve(dlg.returnValue === 'ok');
      };

      btnOk.addEventListener('click', alConfirmar);
      dlg.addEventListener('close', alCerrar);

      dlg.returnValue = '';
      abrirModal(dlg);
      btnOk.focus();
    });
  }

  /* ======================= 7. VISTA: DASHBOARD ========================== */

  function renderDashboard() {
    const t = totales();

    $('#dash-fecha').textContent = fmtFecha(new Date().toISOString());

    $('#kpi-total').textContent = fmtEntero(t.productos);
    $('#kpi-total-sub').textContent =
      fmtEntero(t.unidades) + ' ' + (t.unidades === 1 ? 'unidad' : 'unidades') + ' en stock';

    $('#kpi-bajo').textContent = fmtEntero(t.bajo);
    $('#kpi-bajo-sub').textContent = t.bajo === 0
      ? 'Todo por encima del mínimo'
      : t.cero + ' sin stock · ' + (t.bajo - t.cero) + ' en el límite';

    $('#kpi-bajo-card').classList.toggle('kpi--alert', t.bajo > 0);
    $('#kpi-bajo-card').classList.toggle('kpi--ok', t.bajo === 0);

    $('#kpi-valor-ars').textContent = fmtMontoCorto(t.valorArs, 'AR$');
    $('#kpi-valor-ars-sub').textContent = fmtARS(t.valorArs);

    $('#kpi-valor-usd').textContent = fmtMontoCorto(t.valorUsd, 'US$');
    $('#kpi-valor-usd-sub').textContent =
      fmtUSD(t.valorUsd) + ' · TC ' + fmtDecimal(state.config.tipoCambio);

    renderChart();
    renderAlertas();
  }

  function renderAlertas() {
    const cont = $('#dash-alertas');
    const todos = state.productos.filter(esStockBajo);
    const bajos = todos.slice().sort(function (a, b) {
      if (a.stock !== b.stock) return a.stock - b.stock;
      return colator.compare(a.codigo, b.codigo);
    }).slice(0, 10);

    if (!bajos.length) {
      cont.innerHTML =
        '<div class="empty">' +
          '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>' +
          '<strong>Sin alertas de stock</strong>' +
          'Todos los productos están por encima de su stock mínimo.' +
        '</div>';
      return;
    }

    const filas = bajos.map(function (p) {
      return '<tr class="is-low">' +
        '<td><span class="chip chip--fam" title="' + esc(FAMILIA_NOMBRE[p.familia] || '') + '">' +
          esc(p.familia) + '</span></td>' +
        '<td class="cell-code">' + esc(p.codigo) + '</td>' +
        '<td class="cell-desc"><span class="cell-desc__text" title="' + esc(p.descripcion) + '">' +
          esc(p.descripcion) + '</span></td>' +
        '<td>' + badgeStock(p) + '</td>' +
        '<td class="num">' + fmtEntero(p.stock_minimo) + '</td>' +
        '<td class="cell-actions">' +
          '<button type="button" class="icon-btn" data-action="ajustar-stock" data-id="' + esc(p.id) + '" ' +
            'title="Movimiento de stock" aria-label="Movimiento de stock de ' + esc(p.codigo) + '">' +
            '<i class="fa-solid fa-right-left" aria-hidden="true"></i></button>' +
        '</td>' +
      '</tr>';
    }).join('');

    cont.innerHTML =
      '<table class="data">' +
        '<caption class="sr-only">Productos con stock en o por debajo del mínimo</caption>' +
        '<thead><tr>' +
          '<th scope="col">Familia</th><th scope="col">Código</th>' +
          '<th scope="col">Descripción</th><th scope="col">Stock (u)</th>' +
          '<th scope="col" class="num">Mín.</th><th scope="col" style="text-align:right">Acción</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>' +
      (todos.length > bajos.length
        ? '<div class="pager"><div class="pager__info">Mostrando 10 de ' +
            fmtEntero(todos.length) + ' productos con stock bajo</div></div>'
        : '');
  }

  /** Estado del stock: color + ícono + texto, nunca sólo color. */
  function badgeStock(p) {
    if (p.stock === 0) {
      return '<span class="stock-badge stock-badge--zero">' +
        '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> 0 · sin stock</span>';
    }
    if (esStockBajo(p)) {
      return '<span class="stock-badge stock-badge--low">' +
        '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' +
        fmtEntero(p.stock) + ' u · bajo</span>';
    }
    return '<span class="stock-badge stock-badge--ok">' +
      '<i class="fa-solid fa-check" aria-hidden="true"></i> ' + fmtEntero(p.stock) + ' u</span>';
  }

  /**
   * Refresca el historial sólo cuando el dashboard está a la vista: así no se
   * consulta la base en cada repintado de otra pantalla.
   */
  function refrescarHistorialSiVisible() {
    if (Datos.modo() === 'nube' && ui.vista === 'dashboard') refrescarHistorial();
  }

  /** Historial de movimientos (sólo con sincronización activa). */
  async function refrescarHistorial() {
    if (Datos.modo() !== 'nube') return;

    const cont = $('#dash-historial');
    const movs = await Datos.ultimosMovimientos(25);

    if (!movs.length) {
      cont.innerHTML =
        '<div class="empty">' +
          '<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>' +
          '<strong>Todavía no hay movimientos</strong>' +
          'Acá van a aparecer los cambios de stock con su autor y su motivo.' +
        '</div>';
      return;
    }

    const filas = movs.map(function (m) {
      const positivo = Number(m.delta) > 0;
      return '<tr>' +
        '<td>' + esc(fmtFechaHora(m.creado_en)) + '</td>' +
        '<td class="cell-code">' + esc(m.codigo) + '</td>' +
        '<td class="cell-desc"><span class="cell-desc__text" title="' + esc(m.descripcion || '') + '">' +
          esc(m.descripcion || '') + '</span></td>' +
        '<td class="num"><span class="' + (positivo ? 'delta-pos' : 'delta-neg') + '">' +
          (positivo ? '+' : '−') + fmtEntero(Math.abs(Number(m.delta))) + ' u</span></td>' +
        '<td class="num">' + fmtEntero(m.stock_resultante) + ' u</td>' +
        '<td>' + esc(m.motivo || '—') + '</td>' +
        '<td>' + esc(m.usuario || '—') + '</td>' +
      '</tr>';
    }).join('');

    cont.innerHTML =
      '<table class="data">' +
        '<caption class="sr-only">Últimos movimientos de stock</caption>' +
        '<thead><tr>' +
          '<th scope="col">Fecha</th><th scope="col">Código</th>' +
          '<th scope="col">Descripción</th><th scope="col" class="num">Movimiento</th>' +
          '<th scope="col" class="num">Quedó en</th><th scope="col">Motivo</th>' +
          '<th scope="col">Usuario</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>';
  }

  /* ----------------------- Gráfico de distribución ----------------------- */

  /*
   * Barras horizontales de un solo tono. Las categorías son nominales y la
   * longitud ya codifica la magnitud, así que el color no re-codifica el valor:
   * no hace falta leyenda. Cada barra lleva su valor rotulado en la punta y la
   * vista de tabla da los números exactos.
   */

  const CHART = {
    rowH: 32, barH: 20, radio: 4,
    gutterIzq: 172, gutterDer: 78,
    padTop: 6, padBottom: 6
  };

  const METRICA_INFO = {
    productos: { titulo: 'Cantidad de productos del catálogo', campo: 'productos' },
    valor: { titulo: 'Valor del stock en AR$ (unidades × precio por unidad)', campo: 'valor' },
    unidades: { titulo: 'Unidades en stock', campo: 'unidades' }
  };

  function truncar(txt, maxPx, fontPx) {
    const s = String(txt == null ? '' : txt);
    const anchoChar = fontPx * 0.56;
    const max = Math.max(1, Math.floor(maxPx / anchoChar));
    return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).replace(/\s+$/, '') + '…';
  }

  /** Barra con el extremo de dato redondeado y la base recta. */
  function pathBarra(x, y, w, h, r) {
    if (w <= 0.5) return '';
    const rr = Math.min(r, w, h / 2);
    if (rr <= 0.5) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'z';
    return 'M' + x + ',' + y +
      ' H' + (x + w - rr) +
      ' A' + rr + ',' + rr + ' 0 0 1 ' + (x + w) + ',' + (y + rr) +
      ' V' + (y + h - rr) +
      ' A' + rr + ',' + rr + ' 0 0 1 ' + (x + w - rr) + ',' + (y + h) +
      ' H' + x + ' Z';
  }

  function renderChart() {
    const cont = $('#chart');
    const metrica = METRICA_INFO[ui.chartMetric] || METRICA_INFO.productos;

    $('#chart-title').textContent = ui.chartDim === 'familia'
      ? 'Distribución por familia'
      : 'Distribución por sistema / rubro';
    $('#chart-subtitle').textContent = metrica.titulo;

    const ancho = Math.max(0, Math.floor(cont.clientWidth));
    if (ancho < 120) { ui.chartAnchoRenderizado = 0; return; }
    ui.chartAnchoRenderizado = ancho;

    const grupos = agrupar(ui.chartDim).sort(function (a, b) {
      const d = b[metrica.campo] - a[metrica.campo];
      return d !== 0 ? d : colator.compare(a.etiqueta, b.etiqueta);
    });

    const maximo = grupos.reduce(function (m, g) {
      return Math.max(m, g[metrica.campo]);
    }, 0);

    if (!grupos.length || maximo <= 0) {
      cont.innerHTML =
        '<div class="empty">' +
          '<i class="fa-solid fa-chart-simple" aria-hidden="true"></i>' +
          '<strong>Todavía no hay datos para esta métrica</strong>' +
          (ui.chartMetric === 'productos'
            ? 'Agregá productos al catálogo para ver la distribución.'
            : 'Cargá el stock en unidades para ver esta distribución.') +
        '</div>';
      renderChartTabla(grupos, 0);
      return;
    }

    const gutterIzq = ancho < 460 ? 96 : CHART.gutterIzq;
    const gutterDer = ancho < 460 ? 62 : CHART.gutterDer;
    const anchoPlot = Math.max(40, ancho - gutterIzq - gutterDer);
    const alto = CHART.padTop + CHART.padBottom + grupos.length * CHART.rowH;

    const partes = [];
    partes.push(
      '<svg width="' + ancho + '" height="' + alto + '" viewBox="0 0 ' + ancho + ' ' + alto + '" ' +
      'role="img" aria-label="' + esc(
        $('#chart-title').textContent + '. ' + metrica.titulo + '. ' +
        grupos.length + ' categorías. Los valores exactos están en la vista de tabla.'
      ) + '">'
    );

    grupos.forEach(function (g, i) {
      const valor = g[metrica.campo];
      const yBanda = CHART.padTop + i * CHART.rowH;
      const yBarra = yBanda + (CHART.rowH - CHART.barH) / 2;
      const w = (valor / maximo) * anchoPlot;

      const etiquetaCat = ui.chartDim === 'familia' ? g.sigla + ' · ' + g.etiqueta : g.etiqueta;
      const rotulo = ui.chartMetric === 'valor' ? fmtMontoChart(valor) : fmtEntero(valor);

      partes.push(
        '<g class="chart__row" data-clave="' + esc(g.clave) + '">' +
          '<rect class="chart__bar-hit" x="0" y="' + yBanda + '" width="' + ancho + '" height="' + CHART.rowH + '"></rect>' +
          '<rect class="chart__track" x="' + gutterIzq + '" y="' + yBarra + '" ' +
            'width="' + anchoPlot + '" height="' + CHART.barH + '" rx="4"></rect>' +
          '<text class="chart__cat-label" x="' + (gutterIzq - 10) + '" y="' + (yBarra + CHART.barH / 2) + '" ' +
            'text-anchor="end" dominant-baseline="central">' +
            esc(truncar(etiquetaCat, gutterIzq - 16, 12)) +
          '</text>' +
          '<path class="chart__bar" d="' + pathBarra(gutterIzq, yBarra, w, CHART.barH, CHART.radio) + '"></path>' +
          '<text class="chart__value-label" x="' + (gutterIzq + anchoPlot + 8) + '" ' +
            'y="' + (yBarra + CHART.barH / 2) + '" dominant-baseline="central">' +
            esc(rotulo) +
          '</text>' +
        '</g>'
      );
    });

    partes.push('</svg>');
    cont.innerHTML = partes.join('');

    conectarTooltipChart(cont, grupos, metrica.campo);
    renderChartTabla(grupos, grupos.reduce(function (s, g) { return s + g[metrica.campo]; }, 0));
  }

  function conectarTooltipChart(cont, grupos, campo) {
    const tip = $('#chart-tip');
    const porClave = new Map(grupos.map(function (g) { return [String(g.clave), g]; }));
    const total = grupos.reduce(function (s, g) { return s + g[campo]; }, 0);

    const ocultar = function () {
      tip.classList.remove('is-on');
      tip.setAttribute('aria-hidden', 'true');
    };

    cont.addEventListener('pointerleave', ocultar);

    cont.addEventListener('pointermove', function (ev) {
      const row = ev.target.closest ? ev.target.closest('.chart__row') : null;
      if (!row) { ocultar(); return; }

      const g = porClave.get(row.getAttribute('data-clave'));
      if (!g) { ocultar(); return; }

      const parte = total > 0 ? (g[campo] / total) * 100 : 0;

      tip.innerHTML =
        '<div class="chart-tip__title">' + esc(g.sigla ? g.sigla + ' · ' + g.etiqueta : g.etiqueta) + '</div>' +
        '<div class="chart-tip__row"><span>Productos</span><strong>' + fmtEntero(g.productos) + '</strong></div>' +
        '<div class="chart-tip__row"><span>Unidades</span><strong>' + fmtEntero(g.unidades) + '</strong></div>' +
        '<div class="chart-tip__row"><span>Valor</span><strong>' + fmtARS(g.valor) + '</strong></div>' +
        '<div class="chart-tip__row"><span>Participación</span><strong>' + fmtDecimal(parte) + ' %</strong></div>';

      tip.classList.add('is-on');
      tip.setAttribute('aria-hidden', 'false');

      const r = tip.getBoundingClientRect();
      let x = ev.clientX + 14;
      let y = ev.clientY + 14;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
      tip.style.left = Math.max(8, x) + 'px';
      tip.style.top = Math.max(8, y) + 'px';
    });
  }

  function renderChartTabla(grupos, total) {
    const cont = $('#chart-table');

    if (!grupos.length) {
      cont.innerHTML = '<div class="empty">Sin datos para mostrar.</div>';
      return;
    }

    const campo = (METRICA_INFO[ui.chartMetric] || METRICA_INFO.productos).campo;

    const filas = grupos.map(function (g) {
      const parte = total > 0 ? (g[campo] / total) * 100 : 0;
      return '<tr>' +
        '<td>' + esc(g.sigla ? g.sigla + ' · ' + g.etiqueta : g.etiqueta) + '</td>' +
        '<td class="num">' + fmtEntero(g.productos) + '</td>' +
        '<td class="num">' + fmtEntero(g.unidades) + '</td>' +
        '<td class="num">' + fmtARS(g.valor) + '</td>' +
        '<td class="num">' + fmtDecimal(parte) + ' %</td>' +
      '</tr>';
    }).join('');

    cont.innerHTML =
      '<div class="table-wrap"><table class="data">' +
        '<caption class="sr-only">Valores exactos del gráfico de distribución</caption>' +
        '<thead><tr>' +
          '<th scope="col">' + (ui.chartDim === 'familia' ? 'Familia' : 'Sistema / Rubro') + '</th>' +
          '<th scope="col" class="num">Productos</th>' +
          '<th scope="col" class="num">Unidades</th>' +
          '<th scope="col" class="num">Valor AR$</th>' +
          '<th scope="col" class="num">% métrica</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table></div>';
  }

  /* ======================= 8. VISTA: PRODUCTOS ========================== */

  function productosFiltrados() {
    const q = normalizarTexto(ui.busqueda).trim();
    const terminos = q ? q.split(/\s+/) : [];

    return state.productos.filter(function (p) {
      if (ui.familia && p.familia !== ui.familia) return false;
      if (ui.sistema && p.sistema !== ui.sistema) return false;
      if (ui.stock === 'bajo' && !esStockBajo(p)) return false;
      if (ui.stock === 'cero' && p.stock !== 0) return false;
      if (ui.stock === 'ok' && esStockBajo(p)) return false;
      if (!terminos.length) return true;

      const heno = normalizarTexto([
        p.codigo, p.descripcion, p.familia, FAMILIA_NOMBRE[p.familia] || '',
        p.sistema, p.lote
      ].join(' '));

      return terminos.every(function (t) { return heno.indexOf(t) !== -1; });
    });
  }

  function valorOrden(p, key) {
    switch (key) {
      case 'precio_ars_caja': return precioArsCaja(p);
      case 'precio_ars_unidad': return precioArsUnidad(p);
      case 'ultimo_movimiento': return p.ultimo_movimiento ? Date.parse(p.ultimo_movimiento) || 0 : 0;
      case 'familia': return FAMILIA_NOMBRE[p.familia] || p.familia;
      default: return p[key];
    }
  }

  function ordenar(lista) {
    if (!ui.sortKey) return lista;

    const signo = ui.sortDir === 'desc' ? -1 : 1;
    const key = ui.sortKey;

    return lista.slice().sort(function (a, b) {
      const va = valorOrden(a, key);
      const vb = valorOrden(b, key);

      if (typeof va === 'number' && typeof vb === 'number') {
        if (va !== vb) return (va - vb) * signo;
      } else {
        const c = colator.compare(String(va), String(vb));
        if (c !== 0) return c * signo;
      }
      return colator.compare(a.codigo, b.codigo);
    });
  }

  function renderProductos() {
    const ordenados = ordenar(productosFiltrados());

    const totalPaginas = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
    if (ui.pagina > totalPaginas) ui.pagina = totalPaginas;
    if (ui.pagina < 1) ui.pagina = 1;

    const desde = (ui.pagina - 1) * PAGE_SIZE;
    const pagina = ordenados.slice(desde, desde + PAGE_SIZE);

    $('#prod-count').textContent =
      fmtEntero(state.productos.length) +
      (state.productos.length === 1 ? ' producto' : ' productos');

    $$('#tabla-productos th.sortable').forEach(function (th) {
      const key = th.getAttribute('data-sort');
      const activo = ui.sortKey === key;
      th.setAttribute('aria-sort', activo ? (ui.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');

      const icono = !activo ? 'fa-sort' : (ui.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      let i = th.querySelector('i');
      if (!i) { i = document.createElement('i'); th.appendChild(i); }
      i.className = 'fa-solid ' + icono;
      i.setAttribute('aria-hidden', 'true');
    });

    const tbody = $('#tbody-productos');
    const vacio = $('#productos-vacio');

    if (!ordenados.length) {
      tbody.innerHTML = '';
      vacio.hidden = false;
      const hayFiltros = ui.busqueda || ui.familia || ui.sistema || ui.stock !== 'todos';
      vacio.innerHTML =
        '<div class="empty">' +
          '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
          '<strong>' + (hayFiltros ? 'Ningún producto coincide con los filtros' : 'El catálogo está vacío') + '</strong>' +
          (hayFiltros
            ? 'Probá con otros términos o limpiá los filtros.'
            : 'Agregá tu primer producto con el botón “Agregar producto”.') +
        '</div>';
    } else {
      vacio.hidden = true;
      tbody.innerHTML = pagina.map(filaProducto).join('');
    }

    renderPager(ordenados.length, totalPaginas, desde, pagina.length);
  }

  function filaProducto(p) {
    const arsCaja = precioArsCaja(p);
    const arsUnidad = precioArsUnidad(p);
    const bajo = esStockBajo(p);
    const cajas = equivalenciaCajas(p);

    const mov = p.ultimo_movimiento
      ? '<span title="' + esc(
            fmtFechaHora(p.ultimo_movimiento) +
            (p.ultimo_movimiento_detalle ? ' · ' + p.ultimo_movimiento_detalle : '') +
            (p.actualizado_por ? ' · ' + p.actualizado_por : '')
          ) + '">' + esc(fmtFecha(p.ultimo_movimiento)) + '</span>'
      : '<span style="color:var(--text-3)">—</span>';

    // Recuadro de lote: vacío muestra un guion tenue, clic para editar.
    const loteCell =
      '<button type="button" class="lote-box' + (p.lote ? '' : ' is-vacio') + '" ' +
        'data-action="editar-lote" data-id="' + esc(p.id) + '" ' +
        'title="' + (p.lote ? 'Lote ' + esc(p.lote) + ' — clic para cambiarlo'
                            : 'Sin lote — clic para cargarlo') + '">' +
        (p.lote ? esc(p.lote) : '<span aria-hidden="true">—</span>' +
          '<span class="sr-only">Sin lote cargado</span>') +
      '</button>';

    // El stock es un botón que se convierte en campo al hacerle clic.
    const stockCell =
      '<div class="stock-cell">' +
        '<button type="button" class="stock-edit" data-action="editar-stock" data-id="' + esc(p.id) + '" ' +
          'title="Clic para editar las unidades">' +
          badgeStock(p) +
          '<i class="fa-solid fa-pen" aria-hidden="true"></i>' +
        '</button>' +
      '</div>' +
      (cajas ? '<span class="cajas-hint">' + esc(cajas) + '</span>' : '');

    return '<tr' + (bajo ? ' class="is-low"' : '') + ' data-fila="' + esc(p.id) + '">' +
      '<td><span class="chip chip--fam" title="' + esc(FAMILIA_NOMBRE[p.familia] || '') + '">' +
        esc(p.familia) + '</span></td>' +
      '<td class="cell-code">' + esc(p.codigo) + '</td>' +
      '<td class="cell-desc"><span class="cell-desc__text" title="' + esc(p.descripcion) + '">' +
        esc(p.descripcion) + '</span></td>' +
      '<td><span class="chip">' + esc(p.sistema) + '</span></td>' +
      '<td class="num cell-stock">' + stockCell + '</td>' +
      '<td class="cell-lote">' + loteCell + '</td>' +
      '<td class="num">' + fmtEntero(p.stock_minimo) + '</td>' +
      '<td class="num">' + fmtEntero(p.presentacion_caja) + '</td>' +
      '<td class="num">' + fmtDecimal(p.precio_usd) + '</td>' +
      '<td class="num">' + fmtDecimal(arsCaja) + '</td>' +
      '<td class="num">' + fmtDecimal(arsUnidad) + '</td>' +
      '<td>' + mov + '</td>' +
      '<td class="cell-actions">' +
        '<button type="button" class="icon-btn" data-action="ajustar-stock" data-id="' + esc(p.id) + '" ' +
          'title="Movimiento de stock" aria-label="Movimiento de stock de ' + esc(p.codigo) + '">' +
          '<i class="fa-solid fa-right-left" aria-hidden="true"></i></button> ' +
        '<button type="button" class="icon-btn" data-action="editar" data-id="' + esc(p.id) + '" ' +
          'title="Editar" aria-label="Editar ' + esc(p.codigo) + '">' +
          '<i class="fa-solid fa-pen" aria-hidden="true"></i></button> ' +
        '<button type="button" class="icon-btn icon-btn--danger" data-action="eliminar" data-id="' + esc(p.id) + '" ' +
          'title="Eliminar" aria-label="Eliminar ' + esc(p.codigo) + '">' +
          '<i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>' +
      '</td>' +
    '</tr>';
  }

  function renderPager(total, totalPaginas, desde, enPagina) {
    $('#pager-info').textContent = total === 0
      ? 'Sin resultados'
      : 'Mostrando ' + fmtEntero(desde + 1) + '–' + fmtEntero(desde + enPagina) +
        ' de ' + fmtEntero(total) + (total === 1 ? ' producto' : ' productos');

    const nav = $('#pager-nav');
    if (totalPaginas <= 1) { nav.innerHTML = ''; return; }

    const btn = function (pag, texto, extra) {
      return '<button type="button" data-pagina="' + pag + '" ' + (extra || '') + '>' + texto + '</button>';
    };

    const partes = [];
    partes.push(btn(ui.pagina - 1, '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>',
      'aria-label="Página anterior"' + (ui.pagina === 1 ? ' disabled' : '')));

    const ventana = [];
    const desdePag = Math.max(1, Math.min(ui.pagina - 2, totalPaginas - 4));
    const hastaPag = Math.min(totalPaginas, desdePag + 4);

    if (desdePag > 1) ventana.push(1);
    if (desdePag > 2) ventana.push('...');
    for (let i = desdePag; i <= hastaPag; i++) ventana.push(i);
    if (hastaPag < totalPaginas - 1) ventana.push('...');
    if (hastaPag < totalPaginas) ventana.push(totalPaginas);

    ventana.forEach(function (v) {
      if (v === '...') {
        partes.push('<span class="pager__dots" aria-hidden="true">…</span>');
      } else {
        partes.push(btn(v, String(v),
          (v === ui.pagina ? 'aria-current="page"' : '') + ' aria-label="Página ' + v + '"'));
      }
    });

    partes.push(btn(ui.pagina + 1, '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>',
      'aria-label="Página siguiente"' + (ui.pagina === totalPaginas ? ' disabled' : '')));

    nav.innerHTML = partes.join('');
  }

  /* ==================== 9. ABM DE PRODUCTOS ============================= */

  function llenarSelect(sel, opciones, placeholder) {
    sel.innerHTML =
      (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
      opciones.map(function (o) {
        return '<option value="' + esc(o.valor) + '">' + esc(o.texto) + '</option>';
      }).join('');
  }

  function opcionesFamilia() {
    return FAMILIAS.map(function (f) {
      return { valor: f.codigo, texto: f.codigo + ' — ' + f.nombre };
    });
  }

  function opcionesSistema() {
    const usados = state.productos.map(function (p) { return p.sistema; });
    const todos = SISTEMAS.concat(usados).filter(function (s, i, arr) {
      return s && arr.indexOf(s) === i;
    });
    return todos.map(function (s) { return { valor: s, texto: s }; });
  }

  function setError(inputId, mensaje) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const field = input.closest('.field');
    if (!field) return;

    const slot = field.querySelector('.field__error span');
    if (mensaje) {
      field.classList.add('has-error');
      if (slot) slot.textContent = mensaje;
      input.setAttribute('aria-invalid', 'true');
    } else {
      field.classList.remove('has-error');
      if (slot) slot.textContent = '';
      input.removeAttribute('aria-invalid');
    }
  }

  function limpiarErrores(formEl) {
    $$('.field.has-error', formEl).forEach(function (f) {
      f.classList.remove('has-error');
      const slot = f.querySelector('.field__error span');
      if (slot) slot.textContent = '';
      const inp = f.querySelector('input, select, textarea');
      if (inp) inp.removeAttribute('aria-invalid');
    });
  }

  /** Lee un campo numérico distinguiendo vacío de texto no numérico. */
  function leerNumero(input) {
    if (input.validity && input.validity.badInput) return { error: 'invalido' };
    const v = String(input.value).trim();
    if (v === '') return { error: 'vacio' };
    const n = Number(v);
    if (!isFinite(n)) return { error: 'invalido' };
    return { valor: n };
  }

  function recalcularPreciosForm() {
    const usd = Number($('#p-precio-usd').value);
    const pres = Math.trunc(Number($('#p-presentacion').value));

    const usdOk = isFinite(usd) && usd >= 0 && String($('#p-precio-usd').value).trim() !== '';
    const presOk = isFinite(pres) && pres >= 1;

    const caja = usdOk ? redondear2(usd * state.config.tipoCambio) : null;
    const unidad = (caja !== null && presOk) ? redondear2(caja / pres) : null;

    $('#p-precio-ars-caja').value = caja !== null ? fmtDecimal(caja) : '—';
    $('#p-precio-ars-unidad').value = unidad !== null ? fmtDecimal(unidad) : '—';

    // Equivalencia en cajas del stock que se está tipeando
    const stock = Math.trunc(Number($('#p-stock').value));
    const hint = $('#p-stock-cajas');
    if (presOk && pres > 1 && isFinite(stock) && stock > 0) {
      hint.textContent = '≈ ' + equivalenciaCajas({ presentacion_caja: pres, stock: stock }, stock);
    } else {
      hint.innerHTML = '&nbsp;';
    }
  }

  function abrirFormProducto(id) {
    const dlg = $('#modal-producto');
    const form = $('#form-producto');

    limpiarErrores(form);
    llenarSelect($('#p-familia'), opcionesFamilia(), null);
    llenarSelect($('#p-sistema'), opcionesSistema(), null);
    $$('.tc-actual').forEach(function (el) {
      el.textContent = fmtDecimal(state.config.tipoCambio);
    });

    ui.editandoId = id || null;
    const p = id ? state.productos.find(function (x) { return x.id === id; }) : null;

    if (id && !p) {
      toast('error', 'Producto no encontrado', 'Puede haber sido eliminado desde otro dispositivo.');
      return;
    }

    if (p) {
      $('#modal-producto-title').textContent = 'Modificar producto';
      $('#modal-producto-sub').textContent = 'Código ' + p.codigo;
      $('#p-familia').value = p.familia;
      $('#p-codigo').value = p.codigo;
      $('#p-descripcion').value = p.descripcion;
      $('#p-sistema').value = p.sistema;
      $('#p-presentacion').value = String(p.presentacion_caja);
      $('#p-precio-usd').value = String(p.precio_usd);
      $('#p-stock').value = String(p.stock);
      $('#p-lote').value = p.lote;
      $('#p-stock-minimo').value = String(p.stock_minimo);
      $('#p-observaciones').value = p.observaciones;
    } else {
      $('#modal-producto-title').textContent = 'Agregar producto';
      $('#modal-producto-sub').textContent = 'Completá los datos del artículo';
      form.reset();
      $('#p-familia').value = FAMILIAS[0].codigo;
      $('#p-sistema').value = SISTEMAS[0];
      $('#p-presentacion').value = '1';
      $('#p-stock').value = '0';
      $('#p-lote').value = '';
      $('#p-stock-minimo').value = String(state.config.stockMinimoDefault);
    }

    $('#p-obs-count').textContent = String($('#p-observaciones').value.length);
    recalcularPreciosForm();

    abrirModal(dlg);
    setTimeout(function () { $('#p-codigo').focus(); }, 30);
  }

  function validarFormProducto() {
    const form = $('#form-producto');
    limpiarErrores(form);

    let primerError = null;
    const fallar = function (campo, mensaje) {
      setError(campo, mensaje);
      if (!primerError) primerError = campo;
    };

    const familia = $('#p-familia').value;
    if (!familia || !FAMILIA_NOMBRE[familia]) fallar('p-familia', 'Elegí una familia.');

    const codigo = $('#p-codigo').value.trim();
    if (!codigo) {
      fallar('p-codigo', 'El código es obligatorio.');
    } else if (codigo.length > 30) {
      fallar('p-codigo', 'Máximo 30 caracteres.');
    } else {
      const dup = state.productos.some(function (x) {
        return x.id !== ui.editandoId &&
          normalizarTexto(x.codigo) === normalizarTexto(codigo);
      });
      if (dup) fallar('p-codigo', 'Ya existe un producto con este código.');
    }

    const descripcion = $('#p-descripcion').value.trim();
    if (!descripcion) fallar('p-descripcion', 'La descripción es obligatoria.');
    else if (descripcion.length > 160) fallar('p-descripcion', 'Máximo 160 caracteres.');

    const sistema = $('#p-sistema').value;
    if (!sistema) fallar('p-sistema', 'Elegí un sistema o rubro.');

    const presLeido = leerNumero($('#p-presentacion'));
    let pres = 0;
    if (presLeido.error === 'vacio') fallar('p-presentacion', 'La presentación es obligatoria.');
    else if (presLeido.error) fallar('p-presentacion', 'Ingresá un número válido.');
    else if (!Number.isInteger(presLeido.valor) || presLeido.valor < 1) {
      fallar('p-presentacion', 'Debe ser un número entero de 1 o más.');
    } else pres = presLeido.valor;

    const usdLeido = leerNumero($('#p-precio-usd'));
    let precioUsd = 0;
    if (usdLeido.error === 'vacio') fallar('p-precio-usd', 'El precio en USD es obligatorio.');
    else if (usdLeido.error) fallar('p-precio-usd', 'Ingresá un número válido.');
    else if (usdLeido.valor < 0) fallar('p-precio-usd', 'No puede ser negativo.');
    else precioUsd = redondear2(usdLeido.valor);

    const stockLeido = leerNumero($('#p-stock'));
    let stock = 0;
    if (stockLeido.error === 'vacio') fallar('p-stock', 'El stock es obligatorio (puede ser 0).');
    else if (stockLeido.error) fallar('p-stock', 'Ingresá un número válido.');
    else if (!Number.isInteger(stockLeido.valor) || stockLeido.valor < 0) {
      fallar('p-stock', 'Debe ser un entero de 0 o más.');
    } else stock = stockLeido.valor;

    const minLeido = leerNumero($('#p-stock-minimo'));
    let stockMinimo = 0;
    if (minLeido.error === 'vacio') fallar('p-stock-minimo', 'El stock mínimo es obligatorio (puede ser 0).');
    else if (minLeido.error) fallar('p-stock-minimo', 'Ingresá un número válido.');
    else if (!Number.isInteger(minLeido.valor) || minLeido.valor < 0) {
      fallar('p-stock-minimo', 'Debe ser un entero de 0 o más.');
    } else stockMinimo = minLeido.valor;

    const lote = $('#p-lote').value.trim();
    if (lote.length > 40) fallar('p-lote', 'Máximo 40 caracteres.');

    const observaciones = $('#p-observaciones').value.trim();
    if (observaciones.length > 500) fallar('p-observaciones', 'Máximo 500 caracteres.');

    if (primerError) return { ok: false, primerError: primerError };

    return {
      ok: true,
      datos: {
        familia: familia, codigo: codigo, descripcion: descripcion, sistema: sistema,
        presentacion_caja: pres, precio_usd: precioUsd,
        stock: stock, stock_minimo: stockMinimo, lote: lote,
        observaciones: observaciones
      }
    };
  }

  async function guardarProducto() {
    const res = validarFormProducto();

    if (!res.ok) {
      const el = document.getElementById(res.primerError);
      if (el) el.focus();
      toast('error', 'Revisá el formulario', 'Hay campos con datos que faltan o no son válidos.');
      return;
    }

    const btn = $('#btn-guardar-producto');
    const ahora = new Date().toISOString();
    let producto, esAlta;

    if (ui.editandoId) {
      const i = state.productos.findIndex(function (x) { return x.id === ui.editandoId; });
      if (i === -1) {
        toast('error', 'Producto no encontrado', 'No se pudo guardar la modificación.');
        return;
      }
      const anterior = state.productos[i];
      const cambioStock = anterior.stock !== res.datos.stock;

      producto = Object.assign({}, anterior, res.datos, {
        actualizado: ahora,
        ultimo_movimiento: cambioStock ? ahora : anterior.ultimo_movimiento,
        ultimo_movimiento_detalle: cambioStock
          ? 'Ajuste desde edición: ' + anterior.stock + ' → ' + res.datos.stock + ' u'
          : anterior.ultimo_movimiento_detalle
      });
      esAlta = false;
    } else {
      producto = normalizarProducto(Object.assign({}, res.datos, {
        id: nuevoId(), creado: ahora, actualizado: ahora
      }));
      esAlta = true;
    }

    await conBoton(btn, async function () {
      if (Datos.modo() === 'nube') {
        producto = normalizarProducto(await Datos.guardarProducto(producto));
      }

      if (esAlta) {
        state.productos.push(producto);
      } else {
        const i = state.productos.findIndex(function (x) { return x.id === producto.id; });
        state.productos[i] = producto;
      }

      Datos.escribirCache(state);
      cerrarModal($('#modal-producto'));
      ui.editandoId = null;

      toast('success', esAlta ? 'Producto agregado' : 'Producto modificado',
        producto.codigo + ' — ' + producto.descripcion);
      renderTodo();
    }, esAlta ? 'No se pudo agregar el producto' : 'No se pudo guardar el cambio');
  }

  function eliminarProducto(id) {
    const p = state.productos.find(function (x) { return x.id === id; });
    if (!p) return;

    confirmar({
      titulo: 'Eliminar producto',
      okTexto: 'Sí, eliminar',
      okIcono: 'fa-trash-can',
      okClase: 'btn--danger',
      html:
        '<div class="prod-summary">' +
          '<div style="min-width:0">' +
            '<div class="prod-summary__code">' + esc(p.codigo) + '</div>' +
            '<div class="prod-summary__desc">' + esc(p.descripcion) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="callout callout--danger">' +
          '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
          '<div>Esta acción no se puede deshacer. El producto se va a borrar del catálogo' +
          (p.stock > 0
            ? ' junto con las <strong>' + fmtEntero(p.stock) + ' unidades</strong> de stock registradas.'
            : '.') +
          (Datos.modo() === 'nube' ? ' Se elimina para <strong>todos los dispositivos</strong>.' : '') +
          '</div>' +
        '</div>'
    }).then(async function (ok) {
      if (!ok) return;

      try {
        ui.ocupado = true;
        if (Datos.modo() === 'nube') await Datos.eliminarProducto(id);
        state.productos = state.productos.filter(function (x) { return x.id !== id; });
        Datos.escribirCache(state);
        toast('success', 'Producto eliminado', p.codigo + ' — ' + p.descripcion);
        renderTodo();
      } catch (e) {
        toast('error', 'No se pudo eliminar', e.message);
      } finally {
        ui.ocupado = false;
      }
    });
  }

  /**
   * Envuelve una operación que escribe datos: deshabilita el botón, muestra un
   * spinner y traduce cualquier error a una notificación.
   */
  async function conBoton(btn, fn, mensajeError) {
    const original = btn ? btn.innerHTML : null;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando…';
    }
    ui.ocupado = true;

    try {
      await fn();
    } catch (e) {
      toast('error', mensajeError || 'No se pudo guardar', e.message);
    } finally {
      ui.ocupado = false;
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  }

  /* ============ 10. MOVIMIENTOS DE STOCK (en unidades) ================== */

  /**
   * Única puerta de entrada para cambiar el stock de un producto.
   * Guarda, deja registrado el movimiento y actualiza la memoria.
   *
   * @param {string} id        producto
   * @param {number} nuevoStock  total en unidades que debe quedar
   * @param {string} motivo
   * @param {string} [lote]      si viene, también actualiza el número de lote
   * @returns {{anterior:number, nuevo:number, delta:number, loteCambio:boolean}}
   */
  async function aplicarStock(id, nuevoStock, motivo, lote) {
    const i = state.productos.findIndex(function (x) { return x.id === id; });
    if (i === -1) throw new Error('El producto ya no existe.');

    const p = state.productos[i];
    const anterior = p.stock;
    const delta = nuevoStock - anterior;

    const loteNuevo = lote === undefined
      ? p.lote
      : String(lote == null ? '' : lote).trim().slice(0, 40);
    const loteCambio = loteNuevo !== p.lote;

    // Sin cambios de ninguna clase: no vale la pena escribir.
    if (delta === 0 && !loteCambio) {
      return { anterior: anterior, nuevo: nuevoStock, delta: 0, loteCambio: false };
    }

    const ahora = new Date().toISOString();
    let actualizado = Object.assign({}, p, {
      stock: nuevoStock,
      lote: loteNuevo,
      actualizado: ahora
    });

    // El sello de movimiento sólo se toca si realmente se movió stock.
    if (delta !== 0) {
      actualizado.ultimo_movimiento = ahora;
      actualizado.ultimo_movimiento_detalle =
        (delta > 0 ? '+' : '−') + Math.abs(delta) + ' u' +
        (loteNuevo ? ' · lote ' + loteNuevo : '') +
        (motivo ? ' · ' + motivo : '');
    }

    if (Datos.modo() === 'nube') {
      actualizado = normalizarProducto(await Datos.guardarProducto(actualizado));
      if (delta !== 0) Datos.registrarMovimiento(actualizado, delta, motivo);
    }

    state.productos[i] = actualizado;
    Datos.escribirCache(state);

    return {
      anterior: anterior, nuevo: nuevoStock, delta: delta,
      loteCambio: loteCambio, producto: actualizado
    };
  }

  /**
   * Guarda el número de lote de un producto. No genera un movimiento de stock
   * porque no cambia ninguna cantidad: queda asentado en el producto, con el
   * usuario y la fecha de modificación.
   */
  async function guardarLote(id, lote) {
    const i = state.productos.findIndex(function (x) { return x.id === id; });
    if (i === -1) throw new Error('El producto ya no existe.');

    const p = state.productos[i];
    const limpio = String(lote == null ? '' : lote).trim().slice(0, 40);

    if (limpio === p.lote) return { sinCambios: true, lote: limpio };

    let actualizado = Object.assign({}, p, {
      lote: limpio,
      actualizado: new Date().toISOString()
    });

    if (Datos.modo() === 'nube') {
      actualizado = normalizarProducto(await Datos.guardarProducto(actualizado));
    }

    state.productos[i] = actualizado;
    Datos.escribirCache(state);

    return { sinCambios: false, anterior: p.lote, lote: limpio };
  }

  /* ------------------- Edición en línea en la tabla ---------------------- */

  /** Convierte la celda de stock en un campo de texto editable. */
  function editarStockEnLinea(btn, id) {
    const p = state.productos.find(function (x) { return x.id === id; });
    if (!p || ui.editandoStockId) return;

    ui.editandoStockId = id;
    const celda = btn.parentNode;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'stock-input';
    input.min = '0';
    input.step = '1';
    input.value = String(p.stock);
    input.setAttribute('aria-label', 'Unidades en stock de ' + p.codigo);

    celda.innerHTML = '';
    celda.appendChild(input);
    input.focus();
    input.select();

    let cerrado = false;

    const terminar = async function (guardar) {
      if (cerrado) return;
      cerrado = true;

      const valor = Math.trunc(Number(input.value));
      ui.editandoStockId = null;

      if (!guardar || !isFinite(valor) || valor < 0 || valor === p.stock) {
        if (guardar && (!isFinite(valor) || valor < 0)) {
          toast('warning', 'Valor no válido', 'El stock tiene que ser un número entero de 0 o más.');
        }
        renderProductos();
        return;
      }

      try {
        ui.ocupado = true;
        const r = await aplicarStock(id, valor, 'Edición directa en la tabla');
        toast(r.nuevo <= p.stock_minimo ? 'warning' : 'success',
          'Stock actualizado',
          p.codigo + ': ' + r.anterior + ' → ' + r.nuevo + ' unidades' +
          (r.nuevo <= p.stock_minimo ? ' (en alerta de stock bajo)' : ''));
      } catch (e) {
        toast('error', 'No se pudo guardar el stock', e.message);
      } finally {
        ui.ocupado = false;
        renderTodo();
      }
    };

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); terminar(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); terminar(false); }
    });

    input.addEventListener('blur', function () { terminar(true); });
  }

  /** Convierte el recuadro de lote en un campo de texto editable. */
  function editarLoteEnLinea(btn, id) {
    const p = state.productos.find(function (x) { return x.id === id; });
    if (!p || ui.editandoStockId) return;

    // Se reutiliza el mismo cerrojo que el stock: una sola edición a la vez.
    ui.editandoStockId = id;
    const celda = btn.parentNode;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'lote-input';
    input.maxLength = 40;
    input.value = p.lote;
    input.placeholder = 'Nº de lote';
    input.setAttribute('aria-label', 'Número de lote de ' + p.codigo);

    celda.innerHTML = '';
    celda.appendChild(input);
    input.focus();
    input.select();

    let cerrado = false;

    const terminar = async function (guardar) {
      if (cerrado) return;
      cerrado = true;

      const valor = input.value;
      ui.editandoStockId = null;

      if (!guardar) { renderProductos(); return; }

      try {
        ui.ocupado = true;
        const r = await guardarLote(id, valor);
        if (!r.sinCambios) {
          toast('success', 'Lote actualizado',
            p.codigo + ': ' + (r.lote || '(sin lote)'));
        }
      } catch (e) {
        toast('error', 'No se pudo guardar el lote', e.message);
      } finally {
        ui.ocupado = false;
        renderTodo();
      }
    };

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); terminar(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); terminar(false); }
    });

    input.addEventListener('blur', function () { terminar(true); });
  }

  /* ---------------------- Modal de movimiento --------------------------- */

  function abrirAjusteStock(id) {
    const p = state.productos.find(function (x) { return x.id === id; });
    if (!p) {
      toast('error', 'Producto no encontrado', 'Puede haber sido eliminado.');
      return;
    }

    ui.stockId = id;
    limpiarErrores($('#form-stock'));

    $('#stock-codigo').textContent = p.codigo;
    $('#stock-descripcion').textContent = p.descripcion;
    $('#stock-cantidad').value = '1';
    $('#stock-motivo').value = '';

    // Atajos: unidades sueltas y cajas enteras según la presentación.
    const pres = presentacion(p);
    const chips = [1, 5, 10];
    if (pres > 1) {
      chips.push(pres);
      chips.push(pres * 5);
    } else {
      chips.push(25, 50);
    }

    $('#stock-chips').innerHTML = chips
      .filter(function (c, i, a) { return a.indexOf(c) === i; })
      .map(function (c) {
        const etiqueta = (pres > 1 && c === pres) ? '1 caja (' + c + ')'
          : (pres > 1 && c === pres * 5) ? '5 cajas (' + c + ')'
          : String(c);
        return '<button type="button" data-qty="' + c + '">' + esc(etiqueta) + '</button>';
      }).join('');

    actualizarPreviewStock();
    abrirModal($('#modal-stock'));
    setTimeout(function () { $('#stock-cantidad').select(); }, 30);
  }

  function cantidadStock() {
    const leido = leerNumero($('#stock-cantidad'));
    if (leido.error) return null;
    if (!Number.isInteger(leido.valor) || leido.valor < 1) return null;
    return leido.valor;
  }

  function actualizarPreviewStock() {
    const p = state.productos.find(function (x) { return x.id === ui.stockId; });
    if (!p) return;

    const qty = cantidadStock();
    $('#stock-actual').textContent = fmtEntero(p.stock);

    if (qty === null) {
      $('#stock-resultado').textContent = '—';
      $('#stock-aviso').textContent = '';
      $('#btn-stock-restar').disabled = true;
      $('#btn-stock-sumar').disabled = true;
      return;
    }

    $('#btn-stock-sumar').disabled = false;
    $('#btn-stock-restar').disabled = qty > p.stock;

    $('#stock-resultado').textContent =
      fmtEntero(p.stock - qty) + ' (−) / ' + fmtEntero(p.stock + qty) + ' (+)';

    let aviso = '';
    if (qty > p.stock) {
      aviso = ' · No se puede restar más de ' + fmtEntero(p.stock) +
        (p.stock === 1 ? ' unidad' : ' unidades');
    } else if (p.stock - qty <= p.stock_minimo) {
      aviso = ' · Restar deja el producto en alerta de stock bajo (mínimo ' +
        fmtEntero(p.stock_minimo) + ' u)';
    }
    $('#stock-aviso').textContent = aviso;
  }

  async function aplicarAjusteStock(signo) {
    const p = state.productos.find(function (x) { return x.id === ui.stockId; });
    if (!p) {
      toast('error', 'Producto no encontrado', 'No se pudo registrar el movimiento.');
      return;
    }

    const qty = cantidadStock();
    if (qty === null) {
      setError('stock-cantidad', 'Ingresá una cantidad entera de 1 o más.');
      $('#stock-cantidad').focus();
      return;
    }

    if (signo < 0 && qty > p.stock) {
      setError('stock-cantidad', 'No podés restar ' + qty + ': el stock actual es ' + p.stock + '.');
      $('#stock-cantidad').focus();
      return;
    }

    setError('stock-cantidad', null);

    const motivo = $('#stock-motivo').value.trim();
    const btn = signo > 0 ? $('#btn-stock-sumar') : $('#btn-stock-restar');

    await conBoton(btn, async function () {
      const r = await aplicarStock(p.id, p.stock + signo * qty, motivo);
      cerrarModal($('#modal-stock'));

      const quedaBajo = r.nuevo <= p.stock_minimo;
      toast(quedaBajo ? 'warning' : 'success', 'Stock actualizado',
        p.codigo + ': ' + r.anterior + ' → ' + r.nuevo + ' unidades' +
        (quedaBajo ? ' (en alerta de stock bajo)' : ''));

      ui.stockId = null;
      renderTodo();
    }, 'No se pudo registrar el movimiento');
  }

  /* ------------------------- Carga rápida ------------------------------- */

  /*
   * Pantalla pensada para cargar el inventario de corrido: se escribe el
   * código, las unidades, Enter, y el foco vuelve al buscador. Evita tener que
   * buscar el producto en la tabla y abrir un modal por cada uno.
   */

  function coincidenciasCarga(texto) {
    const q = normalizarTexto(texto).trim();
    if (!q) return [];

    const terminos = q.split(/\s+/);

    const lista = state.productos.filter(function (p) {
      const heno = normalizarTexto(p.codigo + ' ' + p.descripcion + ' ' + p.sistema);
      return terminos.every(function (t) { return heno.indexOf(t) !== -1; });
    });

    // Primero los que empiezan con el código tipeado: es lo más habitual.
    lista.sort(function (a, b) {
      const ea = normalizarTexto(a.codigo).indexOf(q) === 0 ? 0 : 1;
      const eb = normalizarTexto(b.codigo).indexOf(q) === 0 ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return colator.compare(a.codigo, b.codigo);
    });

    return lista.slice(0, 8);
  }

  function renderSugerencias(texto) {
    const cont = $('#carga-sugerencias');
    const input = $('#carga-codigo');
    const lista = coincidenciasCarga(texto);

    ui.cargaSugerenciaActiva = -1;

    if (!texto.trim()) {
      cont.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }

    if (!lista.length) {
      cont.innerHTML = '<div class="sugerencias__vacio">Ningún producto coincide con “' +
        esc(texto) + '”.</div>';
      cont.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    cont.innerHTML = lista.map(function (p, i) {
      return '<button type="button" class="sugerencia" role="option" aria-selected="false" ' +
        'data-id="' + esc(p.id) + '" data-indice="' + i + '">' +
        '<span class="sugerencia__cod">' + esc(p.codigo) + '</span>' +
        '<span class="sugerencia__desc">' + esc(p.descripcion) + '</span>' +
        '<span class="sugerencia__stock">' + fmtEntero(p.stock) + ' u</span>' +
      '</button>';
    }).join('');

    cont.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function moverSugerencia(paso) {
    const items = $$('.sugerencia', $('#carga-sugerencias'));
    if (!items.length) return;

    ui.cargaSugerenciaActiva += paso;
    if (ui.cargaSugerenciaActiva < 0) ui.cargaSugerenciaActiva = items.length - 1;
    if (ui.cargaSugerenciaActiva >= items.length) ui.cargaSugerenciaActiva = 0;

    items.forEach(function (el, i) {
      const activo = i === ui.cargaSugerenciaActiva;
      el.classList.toggle('is-activa', activo);
      el.setAttribute('aria-selected', String(activo));
      if (activo) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function elegirProductoCarga(id) {
    const p = state.productos.find(function (x) { return x.id === id; });
    if (!p) return;

    ui.cargaProductoId = id;
    $('#carga-sugerencias').hidden = true;
    $('#carga-codigo').setAttribute('aria-expanded', 'false');
    $('#carga-codigo').value = p.codigo;
    setError('carga-codigo', null);

    refrescarSeleccionCarga();

    // Se precarga el lote que ya tenga, para no tener que retipearlo.
    $('#carga-lote').value = p.lote;

    const cant = $('#carga-cantidad');
    cant.value = ui.cargaModo === 'fijar' ? String(p.stock) : '';
    cant.focus();
    cant.select();
  }

  function refrescarSeleccionCarga() {
    const cont = $('#carga-seleccion');
    const p = state.productos.find(function (x) { return x.id === ui.cargaProductoId; });

    if (!p) { cont.hidden = true; return; }

    $('#carga-sel-codigo').textContent = p.codigo;
    $('#carga-sel-desc').textContent = p.descripcion;
    $('#carga-sel-stock').textContent = fmtEntero(p.stock) + ' u';

    const eq = equivalenciaCajas(p);
    $('#carga-sel-cajas').textContent = eq
      ? '≈ ' + eq + ' · mínimo ' + fmtEntero(p.stock_minimo) + ' u'
      : 'Mínimo ' + fmtEntero(p.stock_minimo) + ' u';

    $('#carga-sel-lote').textContent = p.lote ? 'Lote ' + p.lote : 'Sin lote cargado';

    cont.hidden = false;
  }

  async function aplicarCarga(ev) {
    if (ev) ev.preventDefault();

    const inputCod = $('#carga-codigo');
    const inputCant = $('#carga-cantidad');

    setError('carga-codigo', null);
    setError('carga-cantidad', null);

    // Si no hay producto elegido pero hay una única coincidencia, se toma esa.
    if (!ui.cargaProductoId) {
      const posibles = coincidenciasCarga(inputCod.value);
      if (posibles.length === 1) {
        ui.cargaProductoId = posibles[0].id;
        inputCod.value = posibles[0].codigo;
        refrescarSeleccionCarga();
      } else {
        setError('carga-codigo', posibles.length
          ? 'Hay varias coincidencias: elegí una de la lista.'
          : 'Elegí un producto de la lista.');
        inputCod.focus();
        return;
      }
    }

    const p = state.productos.find(function (x) { return x.id === ui.cargaProductoId; });
    if (!p) {
      setError('carga-codigo', 'El producto ya no existe.');
      limpiarCarga();
      return;
    }

    const leido = leerNumero(inputCant);
    if (leido.error === 'vacio') {
      setError('carga-cantidad', 'Poné las unidades.');
      inputCant.focus();
      return;
    }
    if (leido.error || !Number.isInteger(leido.valor) || leido.valor < 0) {
      setError('carga-cantidad', 'Tiene que ser un número entero de 0 o más.');
      inputCant.focus();
      return;
    }

    const cantidad = leido.valor;
    let nuevoStock;
    let motivo;

    if (ui.cargaModo === 'fijar') {
      nuevoStock = cantidad;
      motivo = 'Carga rápida (recuento)';
    } else if (ui.cargaModo === 'sumar') {
      nuevoStock = p.stock + cantidad;
      motivo = 'Carga rápida (ingreso)';
    } else {
      nuevoStock = p.stock - cantidad;
      if (nuevoStock < 0) {
        setError('carga-cantidad',
          'No podés restar ' + cantidad + ': el stock actual es ' + p.stock + ' u.');
        inputCant.focus();
        return;
      }
      motivo = 'Carga rápida (salida)';
    }

    const lote = $('#carga-lote').value;

    await conBoton($('#btn-carga-aplicar'), async function () {
      const r = await aplicarStock(p.id, nuevoStock, motivo, lote);

      if (r.delta === 0 && !r.loteCambio) {
        toast('info', 'Sin cambios', p.codigo + ' ya estaba en ' + nuevoStock + ' unidades.');
      } else {
        ui.cargaLog.unshift({
          codigo: p.codigo,
          descripcion: p.descripcion,
          anterior: r.anterior,
          nuevo: r.nuevo,
          delta: r.delta,
          lote: r.producto ? r.producto.lote : lote,
          hora: new Date().toISOString()
        });
        if (ui.cargaLog.length > 50) ui.cargaLog.pop();
        renderCargaLog();

        if (r.delta === 0 && r.loteCambio) {
          toast('success', 'Lote actualizado', p.codigo + ': ' + (lote || '(sin lote)'));
        }
      }

      limpiarCarga();
      renderTodo();
    }, 'No se pudo guardar el stock');
  }

  /** Deja la pantalla lista para el siguiente producto. */
  function limpiarCarga() {
    ui.cargaProductoId = null;
    $('#carga-codigo').value = '';
    $('#carga-cantidad').value = '';
    $('#carga-lote').value = '';
    $('#carga-seleccion').hidden = true;
    $('#carga-sugerencias').hidden = true;
    setError('carga-codigo', null);
    setError('carga-cantidad', null);
    $('#carga-codigo').focus();
  }

  function renderCargaLog() {
    const cont = $('#carga-log');
    const tabla = $('#carga-log-tabla');

    if (!ui.cargaLog.length) { cont.hidden = true; return; }

    tabla.innerHTML =
      '<table class="data">' +
        '<caption class="sr-only">Productos cargados en esta sesión</caption>' +
        '<thead><tr>' +
          '<th scope="col">Hora</th><th scope="col">Código</th>' +
          '<th scope="col">Descripción</th><th scope="col">Lote</th>' +
          '<th scope="col" class="num">Antes</th>' +
          '<th scope="col" class="num">Movimiento</th><th scope="col" class="num">Ahora</th>' +
        '</tr></thead><tbody>' +
        ui.cargaLog.map(function (m) {
          const pos = m.delta > 0;
          return '<tr>' +
            '<td>' + esc(new Date(m.hora).toLocaleTimeString('es-AR',
              { hour: '2-digit', minute: '2-digit' })) + '</td>' +
            '<td class="cell-code">' + esc(m.codigo) + '</td>' +
            '<td class="cell-desc"><span class="cell-desc__text" title="' + esc(m.descripcion) + '">' +
              esc(m.descripcion) + '</span></td>' +
            '<td>' + (m.lote ? esc(m.lote) : '<span style="color:var(--text-3)">—</span>') + '</td>' +
            '<td class="num">' + fmtEntero(m.anterior) + '</td>' +
            '<td class="num"><span class="' + (pos ? 'delta-pos' : 'delta-neg') + '">' +
              (pos ? '+' : '−') + fmtEntero(Math.abs(m.delta)) + '</span></td>' +
            '<td class="num"><strong>' + fmtEntero(m.nuevo) + '</strong></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';

    cont.hidden = false;
  }

  /* ================ 11. EXPORTACIONES E IMPORTACIÓN ===================== */

  function campoCSV(valor, delim) {
    const s = String(valor == null ? '' : valor);
    if (s.indexOf(delim) !== -1 || s.indexOf('"') !== -1 ||
        s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** CSV para Tango Gestión: precio de venta por unidad en AR$. */
  function exportarTango() {
    if (!state.productos.length) {
      toast('warning', 'Nada para exportar', 'El catálogo está vacío.');
      return;
    }

    const delim = state.config.csvDelimitador;

    const lineas = [[
      'COD_ARTICU', 'DESCRIPCIO', 'PRECIO_VTA', 'UNIDAD_MEDIDA', 'RUBRO',
      state.config.csvColumnaLote
    ].join(delim)];

    state.productos.forEach(function (p) {
      lineas.push([
        campoCSV(p.codigo, delim),
        campoCSV(p.descripcion, delim),
        campoCSV(precioArsUnidad(p).toFixed(2), delim),
        campoCSV(state.config.unidadMedida, delim),
        campoCSV(p.sistema, delim),
        campoCSV(p.lote, delim)
      ].join(delim));
    });

    const contenido = '﻿' + lineas.join('\r\n') + '\r\n';
    descargar(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }),
      'IAC_tango_' + sufijoFecha() + '.csv');

    const sinLote = state.productos.filter(function (p) { return !p.lote; }).length;

    if (sinLote) {
      toast('warning', 'CSV generado con lotes incompletos',
        state.productos.length + ' artículos exportados, pero ' + sinLote +
        ' van con el lote vacío.');
    } else {
      toast('success', 'CSV generado',
        state.productos.length + ' artículos exportados para Tango Gestión.');
    }
  }

  function exportarJSON() {
    const payload = {
      app: 'IAC INTERNACIONAL SRL - Gestión de Stock',
      formato: 2,
      unidad_de_stock: 'unidades',
      exportado: new Date().toISOString(),
      config: state.config,
      productos: state.productos
    };

    descargar(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' }),
      'IAC_backup_' + sufijoFecha() + '.json'
    );

    toast('success', 'Backup descargado',
      state.productos.length + ' productos y la configuración actual.');
  }

  function importarJSON(file) {
    if (!file) return;

    const lector = new FileReader();

    lector.onerror = function () {
      toast('error', 'No se pudo leer el archivo', 'Probá de nuevo o con otro archivo.');
    };

    lector.onload = function () {
      let data;
      try {
        data = JSON.parse(String(lector.result));
      } catch (e) {
        toast('error', 'Archivo inválido', 'El contenido no es un JSON válido.');
        return;
      }

      const crudos = Array.isArray(data) ? data
        : (data && Array.isArray(data.productos) ? data.productos : null);

      if (!crudos) {
        toast('error', 'Archivo inválido', 'No se encontró una lista de productos en el archivo.');
        return;
      }

      const normalizados = crudos.map(normalizarProducto).filter(Boolean);
      const descartados = crudos.length - normalizados.length;

      if (!normalizados.length) {
        toast('error', 'Archivo sin productos válidos',
          'Cada producto necesita al menos código y descripción.');
        return;
      }

      const vistos = new Set();
      const unicos = [];
      let duplicados = 0;

      normalizados.forEach(function (p) {
        const clave = normalizarTexto(p.codigo);
        if (vistos.has(clave)) { duplicados++; return; }
        vistos.add(clave);
        unicos.push(p);
      });

      const cfg = (data && !Array.isArray(data) && data.config)
        ? normalizarConfig(data.config) : null;

      // Un backup de la versión 1 contaba el stock en cajas.
      const esFormatoViejo = data && !Array.isArray(data) && data.formato === 1;

      confirmar({
        titulo: 'Importar backup',
        okTexto: 'Sí, reemplazar datos',
        okIcono: 'fa-upload',
        okClase: 'btn--danger',
        html:
          '<div class="callout callout--info" style="margin-bottom:14px">' +
            '<i class="fa-solid fa-file-import" aria-hidden="true"></i>' +
            '<div>El archivo contiene <strong>' + fmtEntero(unicos.length) + '</strong> productos' +
            (cfg ? ' y una configuración (tipo de cambio ' + fmtDecimal(cfg.tipoCambio) + ').' : '.') +
            (duplicados ? '<br>Se van a ignorar ' + duplicados + ' códigos repetidos.' : '') +
            (descartados ? '<br>Se van a ignorar ' + descartados + ' registros sin código o descripción.' : '') +
            '</div>' +
          '</div>' +
          (esFormatoViejo
            ? '<div class="callout callout--warning" style="margin-bottom:14px">' +
              '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
              '<div>Este backup es de la versión anterior, donde el stock se contaba ' +
              'en <strong>cajas</strong>. Los números se van a importar tal cual, pero ahora ' +
              'se interpretan como <strong>unidades</strong>: revisá el stock después de importar.</div>' +
              '</div>'
            : '') +
          '<div class="callout callout--danger">' +
            '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
            '<div>Se reemplazan los <strong>' + fmtEntero(state.productos.length) +
            '</strong> productos que tenés ahora. Esta acción no se puede deshacer.' +
            (Datos.modo() === 'nube'
              ? ' El cambio afecta a <strong>todos los dispositivos</strong>.' : '') +
            '</div>' +
          '</div>'
      }).then(async function (ok) {
        if (!ok) {
          toast('info', 'Importación cancelada', 'No se modificó ningún dato.');
          return;
        }

        try {
          ui.ocupado = true;
          mostrarSplash('Importando…');

          if (Datos.modo() === 'nube') {
            // Se borra lo que hay y se sube el contenido del backup.
            for (const viejo of state.productos) {
              await Datos.eliminarProducto(viejo.id);
            }
            await Datos.sembrarCatalogo(unicos);
            if (cfg) await Datos.guardarConfig(cfg);
          }

          state.productos = unicos;
          if (cfg) state.config = cfg;
          Datos.escribirCache(state);

          ui.pagina = 1;
          sincronizarConfigForm();
          renderTodo();

          toast('success', 'Backup restaurado',
            fmtEntero(unicos.length) + ' productos importados correctamente.');
        } catch (e) {
          toast('error', 'No se pudo importar', e.message);
        } finally {
          ui.ocupado = false;
          ocultarSplash();
        }
      });
    };

    lector.readAsText(file, 'utf-8');
  }

  function exportarExcel() {
    if (typeof window.XLSX === 'undefined') {
      toast('error', 'Excel no disponible',
        'No se pudo cargar la librería de Excel (hace falta conexión a internet la primera vez). ' +
        'Mientras tanto podés usar el CSV de Tango o el backup JSON.');
      return;
    }

    if (!state.productos.length) {
      toast('warning', 'Nada para exportar', 'El catálogo está vacío.');
      return;
    }

    const XLSX = window.XLSX;

    const filas = state.productos.map(function (p) {
      const v = valorStock(p);
      return {
        'Familia': p.familia,
        'Familia (nombre)': FAMILIA_NOMBRE[p.familia] || '',
        'Código': p.codigo,
        'Descripción': p.descripcion,
        'Sistema / Rubro': p.sistema,
        'Unidades por caja': p.presentacion_caja,
        'Precio USD caja': p.precio_usd,
        'Precio AR$ caja': precioArsCaja(p),
        'Precio AR$ unidad': precioArsUnidad(p),
        'Stock (unidades)': p.stock,
        'Lote': p.lote,
        'Equivale a': equivalenciaCajas(p) || '—',
        'Stock mínimo (u)': p.stock_minimo,
        'Estado': p.stock === 0 ? 'SIN STOCK' : (esStockBajo(p) ? 'STOCK BAJO' : 'OK'),
        'Valor stock AR$': v.ars,
        'Valor stock USD': v.usd,
        'Último movimiento': p.ultimo_movimiento ? fmtFechaHora(p.ultimo_movimiento) : '',
        'Detalle movimiento': p.ultimo_movimiento_detalle || '',
        'Modificado por': p.actualizado_por || '',
        'Observaciones': p.observaciones
      };
    });

    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [
      { wch: 8 }, { wch: 24 }, { wch: 12 }, { wch: 52 }, { wch: 18 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 18 },
      { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 30 },
      { wch: 24 }, { wch: 36 }
    ];
    hoja['!autofilter'] = { ref: hoja['!ref'] };

    const t = totales();
    const resumen = [
      { Concepto: 'Empresa', Valor: 'IAC INTERNACIONAL SRL' },
      { Concepto: 'Reporte', Valor: 'Inventario y lista de precios' },
      { Concepto: 'Generado', Valor: fmtFechaHora(new Date().toISOString()) },
      { Concepto: 'Generado por', Valor: Datos.usuarioActual() ? Datos.usuarioActual().email : 'Modo local' },
      { Concepto: 'Unidad de stock', Valor: 'UNIDADES' },
      { Concepto: 'Tipo de cambio (AR$/USD)', Valor: state.config.tipoCambio },
      { Concepto: 'Total de productos', Valor: t.productos },
      { Concepto: 'Unidades en stock', Valor: t.unidades },
      { Concepto: 'Productos con stock bajo', Valor: t.bajo },
      { Concepto: 'Productos sin stock', Valor: t.cero },
      { Concepto: 'Productos sin lote cargado',
        Valor: state.productos.filter(function (p) { return !p.lote; }).length },
      { Concepto: 'Valor inventario AR$', Valor: t.valorArs },
      { Concepto: 'Valor inventario USD', Valor: t.valorUsd },
      { Concepto: '', Valor: '' },
      { Concepto: 'DISTRIBUCIÓN POR FAMILIA', Valor: '' }
    ];

    agrupar('familia').sort(function (a, b) { return b.productos - a.productos; })
      .forEach(function (g) {
        resumen.push({
          Concepto: g.sigla + ' — ' + g.etiqueta,
          Valor: g.productos + ' productos · ' + g.unidades + ' u · AR$ ' + fmtDecimal(g.valor)
        });
      });

    resumen.push({ Concepto: '', Valor: '' });
    resumen.push({ Concepto: 'DISTRIBUCIÓN POR SISTEMA / RUBRO', Valor: '' });

    agrupar('sistema').sort(function (a, b) { return b.productos - a.productos; })
      .forEach(function (g) {
        resumen.push({
          Concepto: g.etiqueta,
          Valor: g.productos + ' productos · ' + g.unidades + ' u · AR$ ' + fmtDecimal(g.valor)
        });
      });

    const hojaResumen = XLSX.utils.json_to_sheet(resumen);
    hojaResumen['!cols'] = [{ wch: 40 }, { wch: 52 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
    XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

    XLSX.writeFile(libro, 'IAC_stock_' + sufijoFecha() + '.xlsx');

    toast('success', 'Excel generado', state.productos.length + ' productos exportados a .xlsx.');
  }

  /* ==================== 12. VISTA: CONFIGURACIÓN ======================== */

  function sincronizarConfigForm() {
    $('#cfg-tc').value = String(state.config.tipoCambio);
    $('#cfg-stock-min').value = String(state.config.stockMinimoDefault);
    $('#cfg-unidad').value = state.config.unidadMedida;
    $('#cfg-col-lote').value = state.config.csvColumnaLote;
    $('#cfg-delim').value = state.config.csvDelimitador;
  }

  async function guardarConfig(ev) {
    if (ev) ev.preventDefault();

    const form = $('#form-config');
    limpiarErrores(form);

    let primerError = null;
    const fallar = function (campo, mensaje) {
      setError(campo, mensaje);
      if (!primerError) primerError = campo;
    };

    const tcLeido = leerNumero($('#cfg-tc'));
    let tc = state.config.tipoCambio;
    if (tcLeido.error === 'vacio') fallar('cfg-tc', 'El tipo de cambio es obligatorio.');
    else if (tcLeido.error) fallar('cfg-tc', 'Ingresá un número válido.');
    else if (!(tcLeido.valor > 0)) fallar('cfg-tc', 'Debe ser mayor que 0.');
    else tc = tcLeido.valor;

    const minLeido = leerNumero($('#cfg-stock-min'));
    let min = state.config.stockMinimoDefault;
    if (minLeido.error === 'vacio') fallar('cfg-stock-min', 'El stock mínimo es obligatorio.');
    else if (minLeido.error) fallar('cfg-stock-min', 'Ingresá un número válido.');
    else if (!Number.isInteger(minLeido.valor) || minLeido.valor < 0) {
      fallar('cfg-stock-min', 'Debe ser un entero de 0 o más.');
    } else min = minLeido.valor;

    const unidad = $('#cfg-unidad').value.trim();
    if (!unidad) fallar('cfg-unidad', 'La unidad de medida es obligatoria.');

    const colLote = $('#cfg-col-lote').value.trim();
    if (!colLote) {
      fallar('cfg-col-lote', 'Poné el nombre de la columna de lote.');
    } else if (/[;,\t"\r\n]/.test(colLote)) {
      fallar('cfg-col-lote', 'No puede llevar comas, punto y coma ni comillas.');
    }

    if (primerError) {
      const el = document.getElementById(primerError);
      if (el) el.focus();
      toast('error', 'Revisá la configuración', 'Hay valores que no son válidos.');
      return;
    }

    const tcAnterior = state.config.tipoCambio;
    const nueva = normalizarConfig({
      tipoCambio: tc,
      stockMinimoDefault: min,
      unidadMedida: unidad,
      csvColumnaLote: colLote,
      csvDelimitador: $('#cfg-delim').value
    });

    await conBoton($('#form-config button[type="submit"]'), async function () {
      if (Datos.modo() === 'nube') await Datos.guardarConfig(nueva);

      state.config = nueva;
      Datos.escribirCache(state);
      sincronizarConfigForm();
      renderTodo();

      if (tcAnterior !== nueva.tipoCambio) {
        toast('success', 'Tipo de cambio actualizado',
          'De ' + fmtDecimal(tcAnterior) + ' a ' + fmtDecimal(nueva.tipoCambio) +
          '. Se recalcularon todos los precios en AR$.');
      } else {
        toast('success', 'Configuración guardada', 'Los cambios ya están aplicados.');
      }
    }, 'No se pudo guardar la configuración');
  }

  function resetDatos() {
    confirmar({
      titulo: 'Restablecer catálogo inicial',
      okTexto: 'Sí, restablecer',
      okIcono: 'fa-rotate-left',
      okClase: 'btn--danger',
      html:
        '<div class="callout callout--danger" style="margin-bottom:14px">' +
          '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
          '<div>Se van a borrar los <strong>' + fmtEntero(state.productos.length) + '</strong> productos ' +
          'actuales, con su stock y sus observaciones, y se vuelve al catálogo original de ' +
          PRODUCTOS_INICIALES.length + ' productos con <strong>0 unidades</strong>.' +
          (Datos.modo() === 'nube'
            ? ' El cambio afecta a <strong>todos los dispositivos</strong>.' : '') +
          '</div>' +
        '</div>' +
        '<div class="callout callout--warning">' +
          '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
          '<div>Si todavía no descargaste un backup JSON, cancelá y hacelo primero: ' +
          'esta acción no se puede deshacer.</div>' +
        '</div>'
    }).then(async function (ok) {
      if (!ok) return;

      const nuevos = catalogoInicial();

      try {
        ui.ocupado = true;
        mostrarSplash('Restableciendo el catálogo…');

        if (Datos.modo() === 'nube') {
          for (const viejo of state.productos) {
            await Datos.eliminarProducto(viejo.id);
          }
          await Datos.sembrarCatalogo(nuevos);
          await Datos.guardarConfig(configPorDefecto());
        }

        state.config = configPorDefecto();
        state.productos = nuevos;
        Datos.escribirCache(state);

        ui.pagina = 1;
        ui.busqueda = '';
        ui.familia = '';
        ui.sistema = '';
        ui.stock = 'todos';
        ui.sortKey = null;
        ui.cargaLog = [];

        sincronizarFiltrosForm();
        sincronizarConfigForm();
        renderCargaLog();
        renderTodo();

        toast('success', 'Catálogo restablecido',
          nuevos.length + ' productos cargados con 0 unidades.');
      } catch (e) {
        toast('error', 'No se pudo restablecer', e.message);
      } finally {
        ui.ocupado = false;
        ocultarSplash();
      }
    });
  }

  /** Estado de los datos y de la sincronización. */
  function renderStorageInfo() {
    const enNube = Datos.modo() === 'nube';
    const bytes = Datos.tamanoCache();
    const kb = bytes / 1024;

    const resumen = fmtEntero(state.productos.length) + ' productos · ' +
      (kb >= 1024 ? fmtDecimal(kb / 1024) + ' MB' : fmtDecimal(kb) + ' KB');

    $('#storage-info').innerHTML = enNube
      ? '<i class="fa-solid fa-cloud" aria-hidden="true"></i> Sincronizado · ' + esc(resumen)
      : '<i class="fa-solid fa-laptop" aria-hidden="true"></i> Sólo este equipo · ' + esc(resumen);

    const sub = $('#cfg-modo-sub');
    if (sub) {
      sub.textContent = enNube
        ? 'Los datos se guardan en Supabase y se comparten entre todos los dispositivos.'
        : 'Los datos se guardan sólo en este navegador.';
    }

    const detalle = $('#cfg-storage-detalle');
    if (detalle) {
      detalle.innerHTML = enNube
        ? 'Conectado como <strong>' + esc(Datos.usuarioActual() ? Datos.usuarioActual().email : '') +
          '</strong>.<br>' + esc(resumen) + ' en la copia local de respaldo.<br>' +
          'El stock se cuenta en <strong>unidades</strong> y los precios en AR$ se calculan ' +
          'con el tipo de cambio vigente (<strong>' + esc(fmtDecimal(state.config.tipoCambio)) +
          '</strong>) cada vez que se muestran.'
        : 'Clave <code>' + esc(Datos.CACHE_KEY) + '</code> del navegador · ' + esc(resumen) + '.<br>' +
          'El stock se cuenta en <strong>unidades</strong> y los precios en AR$ se calculan ' +
          'con el tipo de cambio vigente (<strong>' + esc(fmtDecimal(state.config.tipoCambio)) +
          '</strong>) cada vez que se muestran.';
    }

    const aviso = $('#cfg-aviso-backup-text');
    if (aviso) {
      aviso.innerHTML = enNube
        ? 'Los datos viven en Supabase, así que no se pierden si cambiás de ' +
          'computadora. Aun así, conviene bajar un <strong>backup JSON</strong> cada tanto: ' +
          'es tu red de seguridad ante un borrado accidental.'
        : 'Si borrás los datos de navegación o usás otra computadora, el catálogo no viaja ' +
          'con vos. Descargá un <strong>backup JSON</strong> con regularidad.';
    }
  }

  /* ============== 13. NAVEGACIÓN, TEMA Y EVENTOS ======================= */

  const VISTAS = ['dashboard', 'productos', 'carga', 'exportar', 'configuracion'];

  function navegar(vista) {
    if (VISTAS.indexOf(vista) === -1) vista = 'dashboard';
    ui.vista = vista;

    VISTAS.forEach(function (v) {
      const sec = document.getElementById('view-' + v);
      if (sec) sec.hidden = v !== vista;
    });

    $$('.nav-item[data-nav]').forEach(function (b) {
      const activo = b.getAttribute('data-nav') === vista;
      b.classList.toggle('is-active', activo);
      if (activo) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    cerrarSidebarMobile();
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (vista === 'dashboard') { renderChart(); refrescarHistorialSiVisible(); }
    if (vista === 'carga') setTimeout(function () { $('#carga-codigo').focus(); }, 80);
  }

  function abrirSidebarMobile() {
    $('#sidebar').classList.add('is-open');
    const bd = $('#backdrop');
    bd.hidden = false;
    bd.classList.add('is-open');
    $('#btn-hamburger').setAttribute('aria-expanded', 'true');
  }

  function cerrarSidebarMobile() {
    $('#sidebar').classList.remove('is-open');
    const bd = $('#backdrop');
    bd.classList.remove('is-open');
    bd.hidden = true;
    $('#btn-hamburger').setAttribute('aria-expanded', 'false');
  }

  function temaEfectivo() {
    const guardado = document.documentElement.getAttribute('data-theme');
    if (guardado === 'dark' || guardado === 'light') return guardado;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    try { window.localStorage.setItem(THEME_KEY, tema); } catch (e) { /* sin persistencia */ }

    const icono = $('#theme-icon');
    const btn = $('#btn-theme');
    if (icono) icono.className = 'fa-solid ' + (tema === 'dark' ? 'fa-sun' : 'fa-moon');
    if (btn) {
      btn.setAttribute('aria-label', tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    }

    if (ui.vista === 'dashboard') renderChart();
  }

  /** Repinta todo lo que depende de los datos. */
  function renderTodo() {
    renderDashboard();
    renderProductos();
    renderStorageInfo();
    refrescarSeleccionCarga();
    refrescarHistorialSiVisible();
    $('#header-rate').textContent = fmtDecimal(state.config.tipoCambio);
  }

  function sincronizarFiltrosForm() {
    llenarSelect($('#f-familia'), opcionesFamilia(), 'Todas');
    llenarSelect($('#f-sistema'), opcionesSistema(), 'Todos');
    $('#f-busqueda').value = ui.busqueda;
    $('#f-familia').value = ui.familia;
    $('#f-sistema').value = ui.sistema;
    $('#f-stock').value = ui.stock;
  }

  /** Eventos que existen antes de iniciar sesión. */
  function conectarEventosBase() {
    $('#form-login').addEventListener('submit', hacerLogin);

    $('#btn-theme').addEventListener('click', function () {
      aplicarTema(temaEfectivo() === 'dark' ? 'light' : 'dark');
    });

    $('#sync-banner-close').addEventListener('click', function () {
      $('#sync-banner').hidden = true;
    });

    // Cierre de modales por botón o clic fuera
    $$('dialog.modal').forEach(function (dlg) {
      $$('[data-close]', dlg).forEach(function (b) {
        b.addEventListener('click', function () { cerrarModal(dlg); });
      });
      dlg.addEventListener('click', function (ev) {
        if (ev.target === dlg) cerrarModal(dlg);
      });
    });
  }

  /** Eventos de la aplicación, una vez que hay datos cargados. */
  let eventosAppConectados = false;

  function conectarEventosApp() {
    if (eventosAppConectados) return;
    eventosAppConectados = true;

    // ---- Navegación ----
    $$('.nav-item[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { navegar(b.getAttribute('data-nav')); });
    });

    $('#btn-hamburger').addEventListener('click', function () {
      if ($('#sidebar').classList.contains('is-open')) cerrarSidebarMobile();
      else abrirSidebarMobile();
    });

    $('#backdrop').addEventListener('click', cerrarSidebarMobile);
    $('#btn-logout').addEventListener('click', hacerLogout);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') cerrarSidebarMobile();
    });

    // ---- Acciones globales (delegación) ----
    document.addEventListener('click', function (ev) {
      const btn = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!btn) return;

      const accion = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      switch (accion) {
        case 'nuevo-producto': cerrarSidebarMobile(); abrirFormProducto(null); break;
        case 'editar': abrirFormProducto(id); break;
        case 'eliminar': eliminarProducto(id); break;
        case 'ajustar-stock': abrirAjusteStock(id); break;
        case 'editar-stock': editarStockEnLinea(btn, id); break;
        case 'editar-lote': editarLoteEnLinea(btn, id); break;
        case 'refrescar-historial': refrescarHistorial(); break;
        case 'ver-stock-bajo':
          ui.stock = 'bajo'; ui.pagina = 1;
          sincronizarFiltrosForm(); navegar('productos'); renderProductos();
          break;
        case 'export-tango': exportarTango(); break;
        case 'export-json': exportarJSON(); break;
        case 'export-excel': exportarExcel(); break;
        case 'import-json': $('#input-import').click(); break;
        case 'reset-datos': resetDatos(); break;
      }
    });

    // ---- Formulario de producto ----
    $('#form-producto').addEventListener('submit', function (ev) {
      ev.preventDefault();
      guardarProducto();
    });

    ['#p-precio-usd', '#p-presentacion', '#p-stock'].forEach(function (sel) {
      $(sel).addEventListener('input', recalcularPreciosForm);
    });

    $('#p-observaciones').addEventListener('input', function () {
      $('#p-obs-count').textContent = String($('#p-observaciones').value.length);
    });

    $$('#form-producto input, #form-producto select, #form-producto textarea')
      .forEach(function (inp) {
        inp.addEventListener('input', function () { if (inp.id) setError(inp.id, null); });
      });

    // ---- Modal de stock ----
    $('#form-stock').addEventListener('submit', function (ev) {
      ev.preventDefault();          // Enter = sumar (la acción menos destructiva)
      aplicarAjusteStock(1);
    });

    $('#btn-stock-restar').addEventListener('click', function () { aplicarAjusteStock(-1); });

    $('#stock-menos').addEventListener('click', function () {
      $('#stock-cantidad').value = String(Math.max(1, (cantidadStock() || 1) - 1));
      actualizarPreviewStock();
    });

    $('#stock-mas').addEventListener('click', function () {
      $('#stock-cantidad').value = String((cantidadStock() || 0) + 1);
      actualizarPreviewStock();
    });

    $('#stock-cantidad').addEventListener('input', function () {
      setError('stock-cantidad', null);
      actualizarPreviewStock();
    });

    $('#stock-chips').addEventListener('click', function (ev) {
      const b = ev.target.closest ? ev.target.closest('button[data-qty]') : null;
      if (!b) return;
      $('#stock-cantidad').value = b.getAttribute('data-qty');
      setError('stock-cantidad', null);
      actualizarPreviewStock();
    });

    // ---- Carga rápida ----
    $('#form-carga').addEventListener('submit', aplicarCarga);

    $('#carga-codigo').addEventListener('input', function () {
      ui.cargaProductoId = null;
      $('#carga-seleccion').hidden = true;
      renderSugerencias($('#carga-codigo').value);
    });

    $('#carga-codigo').addEventListener('keydown', function (ev) {
      const abierto = !$('#carga-sugerencias').hidden;

      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (abierto) moverSugerencia(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (abierto) moverSugerencia(-1); }
      else if (ev.key === 'Escape') { $('#carga-sugerencias').hidden = true; }
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        const items = $$('.sugerencia', $('#carga-sugerencias'));
        if (abierto && items.length) {
          const el = items[ui.cargaSugerenciaActiva >= 0 ? ui.cargaSugerenciaActiva : 0];
          if (el) elegirProductoCarga(el.getAttribute('data-id'));
        } else {
          $('#carga-cantidad').focus();
        }
      }
    });

    $('#carga-sugerencias').addEventListener('click', function (ev) {
      const b = ev.target.closest ? ev.target.closest('.sugerencia') : null;
      if (b) elegirProductoCarga(b.getAttribute('data-id'));
    });

    // Clic fuera del buscador: se cierra la lista
    document.addEventListener('click', function (ev) {
      const dentro = ev.target.closest &&
        (ev.target.closest('#carga-sugerencias') || ev.target.closest('#carga-codigo'));
      if (!dentro) $('#carga-sugerencias').hidden = true;
    });

    $$('[data-carga-modo]').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.cargaModo = b.getAttribute('data-carga-modo');
        $$('[data-carga-modo]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });

        // "Dejar en" arranca con el stock actual para poder corregirlo.
        const p = state.productos.find(function (x) { return x.id === ui.cargaProductoId; });
        if (p) $('#carga-cantidad').value = ui.cargaModo === 'fijar' ? String(p.stock) : '';
        $('#carga-cantidad').focus();
      });
    });

    $('#carga-cantidad').addEventListener('input', function () {
      setError('carga-cantidad', null);
    });

    $('#btn-carga-limpiar').addEventListener('click', function () {
      ui.cargaLog = [];
      renderCargaLog();
    });

    // ---- Filtros ----
    $('#f-busqueda').addEventListener('input', debounce(function () {
      ui.busqueda = $('#f-busqueda').value;
      ui.pagina = 1;
      renderProductos();
    }, 180));

    ['#f-familia', '#f-sistema', '#f-stock'].forEach(function (sel) {
      $(sel).addEventListener('change', function () {
        ui.familia = $('#f-familia').value;
        ui.sistema = $('#f-sistema').value;
        ui.stock = $('#f-stock').value;
        ui.pagina = 1;
        renderProductos();
      });
    });

    $('#f-limpiar').addEventListener('click', function () {
      ui.busqueda = ''; ui.familia = ''; ui.sistema = ''; ui.stock = 'todos'; ui.pagina = 1;
      sincronizarFiltrosForm();
      renderProductos();
    });

    // ---- Ordenamiento ----
    $$('#tabla-productos th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.getAttribute('data-sort');
        if (ui.sortKey === key) ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc';
        else { ui.sortKey = key; ui.sortDir = 'asc'; }
        ui.pagina = 1;
        renderProductos();
      });

      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'columnheader');
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); th.click(); }
      });
    });

    // ---- Paginación ----
    $('#pager-nav').addEventListener('click', function (ev) {
      const b = ev.target.closest ? ev.target.closest('button[data-pagina]') : null;
      if (!b || b.disabled) return;
      const p = parseInt(b.getAttribute('data-pagina'), 10);
      if (!isNaN(p)) {
        ui.pagina = p;
        renderProductos();
        $('#view-productos').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });

    // ---- Importación ----
    $('#input-import').addEventListener('change', function (ev) {
      const file = ev.target.files && ev.target.files[0];
      importarJSON(file);
      ev.target.value = '';
    });

    // ---- Configuración ----
    $('#form-config').addEventListener('submit', guardarConfig);

    $('#btn-config-reset-form').addEventListener('click', function () {
      const def = configPorDefecto();
      $('#cfg-tc').value = String(def.tipoCambio);
      $('#cfg-stock-min').value = String(def.stockMinimoDefault);
      $('#cfg-unidad').value = def.unidadMedida;
      $('#cfg-col-lote').value = def.csvColumnaLote;
      $('#cfg-delim').value = def.csvDelimitador;
      limpiarErrores($('#form-config'));
      toast('info', 'Valores por defecto cargados', 'Tocá “Guardar cambios” para aplicarlos.');
    });

    $$('#form-config input, #form-config select').forEach(function (inp) {
      inp.addEventListener('input', function () { if (inp.id) setError(inp.id, null); });
    });

    // ---- Controles del gráfico ----
    $$('[data-chart-dim]').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.chartDim = b.getAttribute('data-chart-dim');
        $$('[data-chart-dim]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        renderChart();
      });
    });

    $$('[data-chart-metric]').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.chartMetric = b.getAttribute('data-chart-metric');
        $$('[data-chart-metric]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        renderChart();
      });
    });

    $('#btn-chart-table').addEventListener('click', function () {
      ui.chartTablaVisible = !ui.chartTablaVisible;
      $('#chart-table').hidden = !ui.chartTablaVisible;
      $('#btn-chart-table').setAttribute('aria-expanded', String(ui.chartTablaVisible));
      $('#btn-chart-table').innerHTML = ui.chartTablaVisible
        ? '<i class="fa-solid fa-chart-simple" aria-hidden="true"></i> Ocultar tabla'
        : '<i class="fa-solid fa-table-list" aria-hidden="true"></i> Ver tabla';
    });

    // El SVG se dibuja a escala 1:1: hay que redibujarlo al cambiar el ancho.
    const alRedimensionar = debounce(function () {
      if (ui.vista !== 'dashboard') return;
      const ancho = Math.floor($('#chart').clientWidth);
      if (Math.abs(ancho - ui.chartAnchoRenderizado) > 8) renderChart();
    }, 140);

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(alRedimensionar).observe($('#chart'));
    }
    window.addEventListener('resize', alRedimensionar);

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const alCambiarMQ = function () { if (ui.vista === 'dashboard') renderChart(); };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', alCambiarMQ);
      else if (typeof mq.addListener === 'function') mq.addListener(alCambiarMQ);
    }

    // En modo local, dos pestañas del mismo navegador se mantienen al día.
    window.addEventListener('storage', function (ev) {
      if (Datos.modo() === 'nube' || ev.key !== Datos.CACHE_KEY) return;
      const cache = Datos.leerCache();
      if (!cache || !Array.isArray(cache.productos)) return;

      state.config = normalizarConfig(cache.config);
      state.productos = cache.productos.map(normalizarProducto).filter(Boolean);
      sincronizarConfigForm();
      renderTodo();
      toast('info', 'Datos actualizados', 'Se recargaron los cambios hechos en otra pestaña.');
    });
  }

  /* ============================ ARRANQUE ================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
