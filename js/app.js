/**
 * app.js — Lógica de la aplicación de gestión de stock de IAC INTERNACIONAL SRL.
 *
 * Aplicación de una sola página, sin backend. Todo el estado vive en el
 * localStorage del navegador y se puede exportar/importar como JSON.
 *
 * Organización del archivo:
 *   1.  Constantes y estado
 *   2.  Persistencia (localStorage)
 *   3.  Utilidades de formato y de DOM
 *   4.  Cálculo de precios y métricas
 *   5.  Notificaciones (toasts)
 *   6.  Modales
 *   7.  Vista: Dashboard (KPIs + gráfico + alertas)
 *   8.  Vista: Productos (búsqueda, filtros, orden, paginación)
 *   9.  ABM de productos (alta, modificación, baja)
 *   10. Ajuste de stock
 *   11. Exportaciones e importación
 *   12. Vista: Configuración
 *   13. Navegación, tema y arranque
 */

'use strict';

(function () {

  /* ===================== 1. CONSTANTES Y ESTADO ========================= */

  /** Clave del localStorage donde vive todo el estado de la app. */
  const STORAGE_KEY = 'iac_stock_v1';

  /** Clave separada para el tema, para poder aplicarlo antes de pintar. */
  const THEME_KEY = 'iac_tema';

  /** Cantidad de filas por página en la tabla de productos. */
  const PAGE_SIZE = 20;

  /** Nombres de las familias indexados por código, para mostrar y exportar. */
  const FAMILIA_NOMBRE = FAMILIAS.reduce(function (acc, f) {
    acc[f.codigo] = f.nombre;
    return acc;
  }, {});

  /**
   * Estado persistido.
   * @type {{config: Object, productos: Object[]}}
   */
  let state = { config: configPorDefecto(), productos: [] };

  /** Estado de interfaz (no se persiste). */
  const ui = {
    vista: 'dashboard',
    busqueda: '',
    familia: '',
    sistema: '',
    stock: 'todos',
    sortKey: null,       // null = orden natural del catálogo
    sortDir: 'asc',
    pagina: 1,
    chartDim: 'familia',
    chartMetric: 'productos',
    chartTablaVisible: false,
    dashMoneda: 'ARS',
    editandoId: null,    // id del producto en edición, o null si es un alta
    stockId: null,       // id del producto cuyo stock se está ajustando
    chartAnchoRenderizado: 0
  };

  /** Configuración por defecto de la aplicación. */
  function configPorDefecto() {
    return {
      tipoCambio: TIPO_CAMBIO_DEFAULT,
      stockMinimoDefault: STOCK_MINIMO_DEFAULT,
      unidadMedida: 'UNIDAD',
      csvDelimitador: ';'
    };
  }

  /* ======================= 2. PERSISTENCIA ============================== */

  /** Genera un identificador interno único para cada producto. */
  function nuevoId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Normaliza un registro de producto venido de cualquier origen (catálogo
   * inicial, formulario o backup importado) al formato interno.
   * Devuelve null si el registro no tiene los datos mínimos.
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
      familia: FAMILIA_NOMBRE[familia] ? familia : (FAMILIAS[0] ? FAMILIAS[0].codigo : ''),
      codigo: codigo,
      descripcion: descripcion,
      sistema: SISTEMAS.indexOf(sistema) !== -1 ? sistema : (sistema || SISTEMAS[0]),
      presentacion_caja: enteroPositivo(raw.presentacion_caja, 1, 1),
      precio_usd: numeroNoNegativo(raw.precio_usd, 0),
      stock: enteroPositivo(raw.stock, 0, 0),
      stock_minimo: enteroPositivo(raw.stock_minimo, 0, STOCK_MINIMO_DEFAULT),
      observaciones: String(raw.observaciones == null ? '' : raw.observaciones).slice(0, 500),
      ultimo_movimiento: raw.ultimo_movimiento ? String(raw.ultimo_movimiento) : null,
      ultimo_movimiento_detalle: raw.ultimo_movimiento_detalle
        ? String(raw.ultimo_movimiento_detalle)
        : null,
      creado: raw.creado ? String(raw.creado) : new Date().toISOString(),
      actualizado: raw.actualizado ? String(raw.actualizado) : new Date().toISOString()
    };
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

  /** Normaliza la configuración, descartando valores inválidos. */
  function normalizarConfig(raw) {
    const def = configPorDefecto();
    if (!raw || typeof raw !== 'object') return def;

    const tc = Number(raw.tipoCambio);
    const delim = String(raw.csvDelimitador == null ? '' : raw.csvDelimitador);

    return {
      tipoCambio: isFinite(tc) && tc > 0 ? tc : def.tipoCambio,
      stockMinimoDefault: enteroPositivo(raw.stockMinimoDefault, 0, def.stockMinimoDefault),
      unidadMedida: (String(raw.unidadMedida == null ? '' : raw.unidadMedida).trim() || def.unidadMedida).slice(0, 20),
      csvDelimitador: [';', ',', '\t'].indexOf(delim) !== -1 ? delim : def.csvDelimitador
    };
  }

  /** Construye el estado inicial a partir del catálogo precargado. */
  function estadoInicial() {
    return {
      config: configPorDefecto(),
      productos: PRODUCTOS_INICIALES
        .map(function (p) {
          return normalizarProducto({
            familia: p.familia,
            codigo: p.codigo,
            descripcion: p.descripcion,
            sistema: p.sistema,
            presentacion_caja: p.presentacion_caja,
            precio_usd: p.precio_usd,
            stock: 0,
            stock_minimo: STOCK_MINIMO_DEFAULT,
            observaciones: ''
          });
        })
        .filter(Boolean)
    };
  }

  /** Lee el estado del localStorage; si no existe o está roto, siembra el inicial. */
  function cargarEstado() {
    let crudo = null;
    try {
      crudo = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // Navegador en modo privado o con almacenamiento bloqueado.
      toast('warning', 'Almacenamiento no disponible',
        'No se pudo leer el almacenamiento local. Los cambios no se van a guardar al cerrar.');
      state = estadoInicial();
      return;
    }

    if (!crudo) {
      state = estadoInicial();
      guardarEstado();
      return;
    }

    try {
      const data = JSON.parse(crudo);
      state = {
        config: normalizarConfig(data.config),
        productos: (Array.isArray(data.productos) ? data.productos : [])
          .map(normalizarProducto)
          .filter(Boolean)
      };
      if (!state.productos.length) state = estadoInicial();
    } catch (e) {
      toast('error', 'Datos dañados',
        'El contenido guardado no se pudo leer. Se restauró el catálogo inicial.');
      state = estadoInicial();
      guardarEstado();
    }
  }

  /** Persiste el estado completo en el localStorage. */
  function guardarEstado() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('error', 'No se pudo guardar',
        'El navegador rechazó el guardado (¿almacenamiento lleno o bloqueado?). ' +
        'Descargá un backup JSON para no perder los cambios.');
      return false;
    }
  }

  /** Tamaño aproximado que ocupan los datos guardados. */
  function tamanoAlmacenado() {
    try {
      const s = window.localStorage.getItem(STORAGE_KEY);
      return s ? s.length : 0;
    } catch (e) {
      return 0;
    }
  }

  /* ================= 3. UTILIDADES DE FORMATO Y DOM ===================== */

  const $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  const $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  /** Escapa texto para poder insertarlo con innerHTML sin riesgo. */
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

  function fmtEntero(n) {
    return nfEnteros.format(isFinite(n) ? n : 0);
  }

  function fmtDecimal(n) {
    return nfDecimales.format(isFinite(n) ? n : 0);
  }

  function fmtARS(n) { return 'AR$ ' + fmtDecimal(n); }
  function fmtUSD(n) { return 'US$ ' + fmtDecimal(n); }

  /**
   * Versión corta para las cifras grandes de los KPIs: evita que un número de
   * diez dígitos desborde la tarjeta. El valor exacto se muestra debajo.
   */
  function fmtMontoCorto(n, prefijo) {
    const v = isFinite(n) ? n : 0;
    const abs = Math.abs(v);
    if (abs >= 1e12) return prefijo + ' ' + fmtDecimal(v / 1e12) + ' billones';
    if (abs >= 1e6) return prefijo + ' ' + fmtDecimal(v / 1e6) + ' millones';
    return prefijo + ' ' + fmtEntero(v);
  }

  /** Versión compacta para las etiquetas del gráfico, donde el espacio es poco. */
  function fmtMontoChart(n) {
    const v = isFinite(n) ? n : 0;
    const abs = Math.abs(v);
    if (abs >= 1e9) return fmtDecimal(v / 1e9) + ' MM';
    if (abs >= 1e6) return fmtDecimal(v / 1e6) + ' M';
    if (abs >= 1e3) return fmtEntero(v / 1e3) + ' k';
    return fmtEntero(v);
  }

  /** Fecha corta (dd/mm/aaaa) a partir de un ISO. */
  function fmtFecha(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Fecha y hora, para el detalle del último movimiento. */
  function fmtFechaHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  /** Sufijo con la fecha de hoy para los nombres de archivo. */
  function sufijoFecha() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** Dispara la descarga de un Blob con el nombre indicado. */
  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Se libera en el próximo tick para no cortar la descarga en Safari.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** Comparador de textos con reglas del español (ignora tildes y mayúsculas). */
  const colator = new Intl.Collator('es-AR', { sensitivity: 'base', numeric: true });

  /** Quita tildes y pasa a minúsculas, para que la búsqueda sea tolerante. */
  function normalizarTexto(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  /* ============== 4. CÁLCULO DE PRECIOS Y MÉTRICAS ====================== */

  /** Redondea a 2 decimales evitando los artefactos del punto flotante. */
  function redondear2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  /** Precio en AR$ por caja. Siempre derivado del tipo de cambio vigente. */
  function precioArsCaja(p) {
    return redondear2(p.precio_usd * state.config.tipoCambio);
  }

  /** Precio en AR$ por unidad = precio por caja ÷ unidades por caja. */
  function precioArsUnidad(p) {
    const pres = p.presentacion_caja > 0 ? p.presentacion_caja : 1;
    return redondear2(precioArsCaja(p) / pres);
  }

  /** true si el producto está en o por debajo de su stock mínimo. */
  function esStockBajo(p) {
    return p.stock <= p.stock_minimo;
  }

  /** Valor del stock de un producto, en AR$ y en USD. */
  function valorStock(p) {
    return {
      ars: redondear2(p.stock * precioArsCaja(p)),
      usd: redondear2(p.stock * p.precio_usd)
    };
  }

  /** Totales del inventario completo. */
  function totales() {
    let valorArs = 0, valorUsd = 0, cajas = 0, bajo = 0, cero = 0;

    state.productos.forEach(function (p) {
      valorArs += p.stock * precioArsCaja(p);
      valorUsd += p.stock * p.precio_usd;
      cajas += p.stock;
      if (esStockBajo(p)) bajo++;
      if (p.stock === 0) cero++;
    });

    return {
      productos: state.productos.length,
      valorArs: redondear2(valorArs),
      valorUsd: redondear2(valorUsd),
      cajas: cajas,
      bajo: bajo,
      cero: cero
    };
  }

  /**
   * Agrupa el catálogo por familia o por sistema y devuelve, para cada grupo,
   * la cantidad de productos, de cajas y el valor en AR$.
   */
  function agrupar(dimension) {
    const mapa = new Map();

    state.productos.forEach(function (p) {
      const clave = dimension === 'familia' ? p.familia : p.sistema;
      let g = mapa.get(clave);
      if (!g) {
        g = {
          clave: clave,
          etiqueta: dimension === 'familia'
            ? (FAMILIA_NOMBRE[clave] || clave)
            : clave,
          sigla: dimension === 'familia' ? clave : '',
          productos: 0,
          cajas: 0,
          valor: 0
        };
        mapa.set(clave, g);
      }
      g.productos++;
      g.cajas += p.stock;
      g.valor += p.stock * precioArsCaja(p);
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

  /**
   * Muestra una notificación efímera.
   * @param {'success'|'error'|'warning'|'info'} tipo
   */
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
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    };

    $('.toast__close', el).addEventListener('click', quitar);
    cont.appendChild(el);

    // Tope de notificaciones visibles: varias acciones seguidas no deben tapar
    // la pantalla. Se van descartando las mas viejas.
    while (cont.children.length > 4) cont.removeChild(cont.firstChild);
    setTimeout(quitar, tipo === 'error' ? 7000 : 4200);
  }

  /* ========================== 6. MODALES ================================ */

  /** Abre un <dialog> de forma modal, con respaldo si el navegador es viejo. */
  function abrirModal(dlg) {
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function cerrarModal(dlg, valor) {
    if (typeof dlg.close === 'function') {
      dlg.close(valor || '');
    } else {
      dlg.removeAttribute('open');
    }
  }

  /**
   * Confirmación genérica. Devuelve una promesa que resuelve true si el usuario
   * confirmó. Se usa para el borrado de productos, la importación y el reset.
   */
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

    // --- KPIs ---
    $('#kpi-total').textContent = fmtEntero(t.productos);
    $('#kpi-total-sub').textContent =
      fmtEntero(t.cajas) + ' ' + (t.cajas === 1 ? 'caja' : 'cajas') + ' en stock';

    $('#kpi-bajo').textContent = fmtEntero(t.bajo);
    $('#kpi-bajo-sub').textContent = t.bajo === 0
      ? 'Todo por encima del mínimo'
      : t.cero + ' sin stock · ' + (t.bajo - t.cero) + ' en el límite';

    // La tarjeta sólo se pinta en rojo cuando efectivamente hay alertas.
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

  /** Tabla de los productos con stock bajo que se muestra en el dashboard. */
  function renderAlertas() {
    const cont = $('#dash-alertas');
    const bajos = state.productos
      .filter(esStockBajo)
      .sort(function (a, b) {
        // Primero los que tienen menos stock; a igual stock, por código.
        if (a.stock !== b.stock) return a.stock - b.stock;
        return colator.compare(a.codigo, b.codigo);
      })
      .slice(0, 10);

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
            'title="Ajustar stock" aria-label="Ajustar stock de ' + esc(p.codigo) + '">' +
            '<i class="fa-solid fa-right-left" aria-hidden="true"></i></button>' +
        '</td>' +
      '</tr>';
    }).join('');

    const total = state.productos.filter(esStockBajo).length;

    cont.innerHTML =
      '<table class="data">' +
        '<caption class="sr-only">Productos con stock en o por debajo del mínimo</caption>' +
        '<thead><tr>' +
          '<th scope="col">Familia</th><th scope="col">Código</th>' +
          '<th scope="col">Descripción</th><th scope="col">Stock</th>' +
          '<th scope="col" class="num">Mín.</th><th scope="col" style="text-align:right">Acción</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>' +
      (total > bajos.length
        ? '<div class="pager"><div class="pager__info">Mostrando 10 de ' +
            fmtEntero(total) + ' productos con stock bajo</div></div>'
        : '');
  }

  /** Badge de stock: color + ícono + texto, nunca sólo color. */
  function badgeStock(p) {
    if (p.stock === 0) {
      return '<span class="stock-badge stock-badge--zero">' +
        '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> 0 · sin stock</span>';
    }
    if (esStockBajo(p)) {
      return '<span class="stock-badge stock-badge--low">' +
        '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' +
        fmtEntero(p.stock) + ' · bajo</span>';
    }
    return '<span class="stock-badge stock-badge--ok">' +
      '<i class="fa-solid fa-check" aria-hidden="true"></i> ' + fmtEntero(p.stock) + '</span>';
  }

  /* ----------------------- Gráfico de distribución ----------------------- */

  /*
   * Barras horizontales de un solo tono. Las categorías son nominales (familias
   * y rubros) y la longitud de la barra ya codifica la magnitud, así que el
   * color no vuelve a codificar el valor: no hace falta leyenda, el título dice
   * qué se está midiendo. Cada barra lleva su valor rotulado en la punta y hay
   * una vista de tabla como canal alternativo.
   *
   * El SVG se dibuja a escala 1:1 contra el ancho real del contenedor (en lugar
   * de escalar un viewBox fijo) para que las tipografías conserven su tamaño en
   * mobile.
   */

  const CHART = {
    rowH: 32,          // alto de la banda de cada categoría
    barH: 20,          // grosor de la barra (tope de 24px)
    radio: 4,          // radio del extremo de dato
    gutterIzq: 172,    // espacio para las etiquetas de categoría
    gutterDer: 78,     // espacio para el rótulo de valor
    padTop: 6,
    padBottom: 6
  };

  const METRICA_INFO = {
    productos: { titulo: 'Cantidad de productos del catálogo', campo: 'productos' },
    valor: { titulo: 'Valor del stock en AR$ (stock × precio por caja)', campo: 'valor' },
    cajas: { titulo: 'Cajas en stock', campo: 'cajas' }
  };

  /** Recorta un texto para que entre en un ancho dado (el SVG no hace ellipsis). */
  function truncar(txt, maxPx, fontPx) {
    const s = String(txt == null ? '' : txt);
    const anchoChar = fontPx * 0.56;               // aproximación para Inter
    const max = Math.max(1, Math.floor(maxPx / anchoChar));
    return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).replace(/\s+$/, '') + '…';
  }

  /**
   * Construye el path de una barra horizontal con el extremo de dato
   * redondeado y la base (izquierda) recta.
   */
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

    // Título y subtítulo describen qué se mide (reemplazan a la leyenda).
    $('#chart-title').textContent = ui.chartDim === 'familia'
      ? 'Distribución por familia'
      : 'Distribución por sistema / rubro';
    $('#chart-subtitle').textContent = metrica.titulo;

    const ancho = Math.max(0, Math.floor(cont.clientWidth));

    // Si la vista está oculta todavía no hay ancho medible: se reintenta al
    // mostrar la vista o al redimensionar.
    if (ancho < 120) {
      ui.chartAnchoRenderizado = 0;
      return;
    }
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
            : 'Cargá el stock de los productos para ver esta distribución.') +
        '</div>';
      renderChartTabla(grupos, 0);
      return;
    }

    // En pantallas chicas se recorta el espacio de las etiquetas.
    const gutterIzq = ancho < 460 ? 96 : CHART.gutterIzq;
    const gutterDer = ancho < 460 ? 62 : CHART.gutterDer;
    const anchoPlot = Math.max(40, ancho - gutterIzq - gutterDer);
    const alto = CHART.padTop + CHART.padBottom + grupos.length * CHART.rowH;

    const partes = [];
    partes.push(
      '<svg width="' + ancho + '" height="' + alto + '" viewBox="0 0 ' + ancho + ' ' + alto + '" ' +
      'role="img" aria-label="' + esc(
        $('#chart-title').textContent + '. ' + metrica.titulo +
        '. ' + grupos.length + ' categorías. Los valores exactos están en la vista de tabla.'
      ) + '">'
    );

    grupos.forEach(function (g, i) {
      const valor = g[metrica.campo];
      const yBanda = CHART.padTop + i * CHART.rowH;
      const yBarra = yBanda + (CHART.rowH - CHART.barH) / 2;
      const w = maximo > 0 ? (valor / maximo) * anchoPlot : 0;

      const etiquetaCat = ui.chartDim === 'familia'
        ? g.sigla + ' · ' + g.etiqueta
        : g.etiqueta;

      const rotulo = ui.chartMetric === 'valor' ? fmtMontoChart(valor) : fmtEntero(valor);

      partes.push(
        '<g class="chart__row" data-clave="' + esc(g.clave) + '">' +
          // Zona sensible al puntero: cubre toda la banda, no sólo la barra.
          '<rect class="chart__bar-hit" x="0" y="' + yBanda + '" width="' + ancho + '" height="' + CHART.rowH + '"></rect>' +
          // Riel de fondo: indica el máximo de referencia.
          '<rect class="chart__track" x="' + gutterIzq + '" y="' + yBarra + '" ' +
            'width="' + anchoPlot + '" height="' + CHART.barH + '" rx="4"></rect>' +
          // Etiqueta de categoría (texto, nunca con el color de la serie).
          '<text class="chart__cat-label" x="' + (gutterIzq - 10) + '" y="' + (yBarra + CHART.barH / 2) + '" ' +
            'text-anchor="end" dominant-baseline="central">' +
            esc(truncar(etiquetaCat, gutterIzq - 16, 12)) +
          '</text>' +
          // Barra de dato.
          '<path class="chart__bar" d="' + pathBarra(gutterIzq, yBarra, w, CHART.barH, CHART.radio) + '"></path>' +
          // Rótulo directo en la punta.
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

  /** Tooltip por barra: aporta el resto de las métricas y la participación. */
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
        '<div class="chart-tip__row"><span>Cajas</span><strong>' + fmtEntero(g.cajas) + '</strong></div>' +
        '<div class="chart-tip__row"><span>Valor</span><strong>' + fmtARS(g.valor) + '</strong></div>' +
        '<div class="chart-tip__row"><span>Participación</span><strong>' + fmtDecimal(parte) + ' %</strong></div>';

      tip.classList.add('is-on');
      tip.setAttribute('aria-hidden', 'false');

      // Se reposiciona para que nunca salga de la ventana.
      const r = tip.getBoundingClientRect();
      let x = ev.clientX + 14;
      let y = ev.clientY + 14;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
      tip.style.left = Math.max(8, x) + 'px';
      tip.style.top = Math.max(8, y) + 'px';
    });
  }

  /** Vista de tabla del gráfico: canal de respaldo con los valores exactos. */
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
        '<td class="num">' + fmtEntero(g.cajas) + '</td>' +
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
          '<th scope="col" class="num">Cajas</th>' +
          '<th scope="col" class="num">Valor AR$</th>' +
          '<th scope="col" class="num">% métrica</th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table></div>';
  }

  /* ======================= 8. VISTA: PRODUCTOS ========================== */

  /** Aplica búsqueda y filtros sobre el catálogo. */
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

      // Búsqueda global: código, descripción, familia (sigla y nombre) y sistema.
      const heno = normalizarTexto([
        p.codigo, p.descripcion, p.familia, FAMILIA_NOMBRE[p.familia] || '', p.sistema
      ].join(' '));

      return terminos.every(function (t) { return heno.indexOf(t) !== -1; });
    });
  }

  /** Valor por el cual ordenar, según la columna elegida. */
  function valorOrden(p, key) {
    switch (key) {
      case 'precio_ars_caja': return precioArsCaja(p);
      case 'precio_ars_unidad': return precioArsUnidad(p);
      case 'ultimo_movimiento': return p.ultimo_movimiento ? Date.parse(p.ultimo_movimiento) || 0 : 0;
      case 'familia': return FAMILIA_NOMBRE[p.familia] || p.familia;
      default: return p[key];
    }
  }

  /** Ordena una copia del listado por la columna y el sentido activos. */
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
      // Desempate estable por código, para que el orden no cambie entre renders.
      return colator.compare(a.codigo, b.codigo);
    });
  }

  function renderProductos() {
    const filtrados = productosFiltrados();
    const ordenados = ordenar(filtrados);

    const totalPaginas = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
    if (ui.pagina > totalPaginas) ui.pagina = totalPaginas;
    if (ui.pagina < 1) ui.pagina = 1;

    const desde = (ui.pagina - 1) * PAGE_SIZE;
    const pagina = ordenados.slice(desde, desde + PAGE_SIZE);

    $('#prod-count').textContent =
      fmtEntero(state.productos.length) + (state.productos.length === 1 ? ' producto' : ' productos');

    // --- Encabezados: indicador de orden ---
    $$('#tabla-productos th.sortable').forEach(function (th) {
      const key = th.getAttribute('data-sort');
      const activo = ui.sortKey === key;
      const dir = activo ? (ui.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
      th.setAttribute('aria-sort', dir);

      const icono = !activo ? 'fa-sort' : (ui.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      let i = th.querySelector('i');
      if (!i) {
        i = document.createElement('i');
        th.appendChild(i);
      }
      i.className = 'fa-solid ' + icono;
      i.setAttribute('aria-hidden', 'true');
    });

    // --- Filas ---
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

    const mov = p.ultimo_movimiento
      ? '<span title="' + esc(
            fmtFechaHora(p.ultimo_movimiento) +
            (p.ultimo_movimiento_detalle ? ' · ' + p.ultimo_movimiento_detalle : '')
          ) + '">' + esc(fmtFecha(p.ultimo_movimiento)) + '</span>'
      : '<span style="color:var(--text-3)">—</span>';

    return '<tr' + (bajo ? ' class="is-low"' : '') + '>' +
      '<td><span class="chip chip--fam" title="' + esc(FAMILIA_NOMBRE[p.familia] || '') + '">' +
        esc(p.familia) + '</span></td>' +
      '<td class="cell-code">' + esc(p.codigo) + '</td>' +
      '<td class="cell-desc"><span class="cell-desc__text" title="' + esc(p.descripcion) + '">' +
        esc(p.descripcion) + '</span></td>' +
      '<td><span class="chip">' + esc(p.sistema) + '</span></td>' +
      '<td>' + badgeStock(p) + '</td>' +
      '<td class="num">' + fmtEntero(p.stock_minimo) + '</td>' +
      '<td class="num">' + fmtEntero(p.presentacion_caja) + '</td>' +
      '<td class="num">' + fmtDecimal(p.precio_usd) + '</td>' +
      '<td class="num">' + fmtDecimal(arsCaja) + '</td>' +
      '<td class="num">' + fmtDecimal(arsUnidad) + '</td>' +
      '<td>' + mov + '</td>' +
      '<td class="cell-actions">' +
        '<button type="button" class="icon-btn" data-action="ajustar-stock" data-id="' + esc(p.id) + '" ' +
          'title="Ajustar stock" aria-label="Ajustar stock de ' + esc(p.codigo) + '">' +
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

  /** Paginación: info + botonera con ventana de páginas. */
  function renderPager(total, totalPaginas, desde, enPagina) {
    $('#pager-info').textContent = total === 0
      ? 'Sin resultados'
      : 'Mostrando ' + fmtEntero(desde + 1) + '–' + fmtEntero(desde + enPagina) +
        ' de ' + fmtEntero(total) + (total === 1 ? ' producto' : ' productos');

    const nav = $('#pager-nav');
    if (totalPaginas <= 1) {
      nav.innerHTML = '';
      return;
    }

    const btn = function (pag, texto, extra) {
      return '<button type="button" data-pagina="' + pag + '" ' + (extra || '') + '>' + texto + '</button>';
    };

    const partes = [];
    partes.push(btn(ui.pagina - 1, '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>',
      'aria-label="Página anterior"' + (ui.pagina === 1 ? ' disabled' : '')));

    // Ventana de 5 páginas centrada en la actual, con elipsis en los extremos.
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

  /** Rellena un <select> con opciones. */
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
    // Incluye los rubros definidos más cualquiera que aparezca en los datos.
    const usados = state.productos.map(function (p) { return p.sistema; });
    const todos = SISTEMAS.concat(usados).filter(function (s, i, arr) {
      return s && arr.indexOf(s) === i;
    });
    return todos.map(function (s) { return { valor: s, texto: s }; });
  }

  /** Marca o limpia el error de un campo del formulario. */
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

  /** Lee un campo numérico distinguiendo "vacío" de "texto no numérico". */
  function leerNumero(input) {
    if (input.validity && input.validity.badInput) return { error: 'invalido' };
    const v = String(input.value).trim();
    if (v === '') return { error: 'vacio' };
    const n = Number(v);
    if (!isFinite(n)) return { error: 'invalido' };
    return { valor: n };
  }

  /** Recalcula los dos campos de precio en AR$ del formulario. */
  function recalcularPreciosForm() {
    const usd = Number($('#p-precio-usd').value);
    const pres = Math.trunc(Number($('#p-presentacion').value));

    const usdOk = isFinite(usd) && usd >= 0 && String($('#p-precio-usd').value).trim() !== '';
    const presOk = isFinite(pres) && pres >= 1;

    const caja = usdOk ? redondear2(usd * state.config.tipoCambio) : null;
    const unidad = (caja !== null && presOk) ? redondear2(caja / pres) : null;

    $('#p-precio-ars-caja').value = caja !== null ? fmtDecimal(caja) : '—';
    $('#p-precio-ars-unidad').value = unidad !== null ? fmtDecimal(unidad) : '—';
  }

  /** Abre el modal de alta, o de modificación si se pasa un id. */
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
      toast('error', 'Producto no encontrado', 'Puede haber sido eliminado en otra pestaña.');
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
      $('#p-stock-minimo').value = String(state.config.stockMinimoDefault);
    }

    $('#p-obs-count').textContent = String($('#p-observaciones').value.length);
    recalcularPreciosForm();

    abrirModal(dlg);
    setTimeout(function () { $('#p-codigo').focus(); }, 30);
  }

  /**
   * Valida el formulario de producto.
   * @returns {{ok: boolean, datos?: Object, primerError?: string}}
   */
  function validarFormProducto() {
    const form = $('#form-producto');
    limpiarErrores(form);

    let primerError = null;
    const fallar = function (campo, mensaje) {
      setError(campo, mensaje);
      if (!primerError) primerError = campo;
    };

    // --- Familia ---
    const familia = $('#p-familia').value;
    if (!familia || !FAMILIA_NOMBRE[familia]) fallar('p-familia', 'Elegí una familia.');

    // --- Código: obligatorio y único ---
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

    // --- Descripción ---
    const descripcion = $('#p-descripcion').value.trim();
    if (!descripcion) {
      fallar('p-descripcion', 'La descripción es obligatoria.');
    } else if (descripcion.length > 160) {
      fallar('p-descripcion', 'Máximo 160 caracteres.');
    }

    // --- Sistema / Rubro ---
    const sistema = $('#p-sistema').value;
    if (!sistema) fallar('p-sistema', 'Elegí un sistema o rubro.');

    // --- Presentación ---
    const presLeido = leerNumero($('#p-presentacion'));
    let presentacion = 0;
    if (presLeido.error === 'vacio') {
      fallar('p-presentacion', 'La presentación es obligatoria.');
    } else if (presLeido.error) {
      fallar('p-presentacion', 'Ingresá un número válido.');
    } else if (!Number.isInteger(presLeido.valor) || presLeido.valor < 1) {
      fallar('p-presentacion', 'Debe ser un número entero de 1 o más.');
    } else {
      presentacion = presLeido.valor;
    }

    // --- Precio USD ---
    const usdLeido = leerNumero($('#p-precio-usd'));
    let precioUsd = 0;
    if (usdLeido.error === 'vacio') {
      fallar('p-precio-usd', 'El precio en USD es obligatorio.');
    } else if (usdLeido.error) {
      fallar('p-precio-usd', 'Ingresá un número válido.');
    } else if (usdLeido.valor < 0) {
      fallar('p-precio-usd', 'No puede ser negativo.');
    } else {
      precioUsd = redondear2(usdLeido.valor);
    }

    // --- Stock actual ---
    const stockLeido = leerNumero($('#p-stock'));
    let stock = 0;
    if (stockLeido.error === 'vacio') {
      fallar('p-stock', 'El stock es obligatorio (puede ser 0).');
    } else if (stockLeido.error) {
      fallar('p-stock', 'Ingresá un número válido.');
    } else if (!Number.isInteger(stockLeido.valor) || stockLeido.valor < 0) {
      fallar('p-stock', 'Debe ser un entero de 0 o más.');
    } else {
      stock = stockLeido.valor;
    }

    // --- Stock mínimo ---
    const minLeido = leerNumero($('#p-stock-minimo'));
    let stockMinimo = 0;
    if (minLeido.error === 'vacio') {
      fallar('p-stock-minimo', 'El stock mínimo es obligatorio (puede ser 0).');
    } else if (minLeido.error) {
      fallar('p-stock-minimo', 'Ingresá un número válido.');
    } else if (!Number.isInteger(minLeido.valor) || minLeido.valor < 0) {
      fallar('p-stock-minimo', 'Debe ser un entero de 0 o más.');
    } else {
      stockMinimo = minLeido.valor;
    }

    const observaciones = $('#p-observaciones').value.trim();
    if (observaciones.length > 500) fallar('p-observaciones', 'Máximo 500 caracteres.');

    if (primerError) return { ok: false, primerError: primerError };

    return {
      ok: true,
      datos: {
        familia: familia,
        codigo: codigo,
        descripcion: descripcion,
        sistema: sistema,
        presentacion_caja: presentacion,
        precio_usd: precioUsd,
        stock: stock,
        stock_minimo: stockMinimo,
        observaciones: observaciones
      }
    };
  }

  /** Guarda el alta o la modificación. */
  function guardarProducto() {
    const res = validarFormProducto();

    if (!res.ok) {
      const el = document.getElementById(res.primerError);
      if (el) el.focus();
      toast('error', 'Revisá el formulario', 'Hay campos con datos que faltan o no son válidos.');
      return;
    }

    const ahora = new Date().toISOString();

    if (ui.editandoId) {
      const i = state.productos.findIndex(function (x) { return x.id === ui.editandoId; });
      if (i === -1) {
        toast('error', 'Producto no encontrado', 'No se pudo guardar la modificación.');
        return;
      }
      const anterior = state.productos[i];
      const stockCambio = anterior.stock !== res.datos.stock;

      state.productos[i] = Object.assign({}, anterior, res.datos, {
        actualizado: ahora,
        // Editar el stock desde el ABM también cuenta como movimiento.
        ultimo_movimiento: stockCambio ? ahora : anterior.ultimo_movimiento,
        ultimo_movimiento_detalle: stockCambio
          ? 'Ajuste desde edición: ' + anterior.stock + ' → ' + res.datos.stock + ' cajas'
          : anterior.ultimo_movimiento_detalle
      });

      guardarEstado();
      toast('success', 'Producto modificado', res.datos.codigo + ' — ' + res.datos.descripcion);
    } else {
      const nuevo = normalizarProducto(Object.assign({}, res.datos, {
        id: nuevoId(), creado: ahora, actualizado: ahora
      }));
      state.productos.push(nuevo);
      guardarEstado();
      toast('success', 'Producto agregado', nuevo.codigo + ' — ' + nuevo.descripcion);
    }

    cerrarModal($('#modal-producto'));
    ui.editandoId = null;
    renderTodo();
  }

  /** Baja de producto, con confirmación previa. */
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
            ? ' junto con las <strong>' + fmtEntero(p.stock) + ' cajas</strong> de stock registradas.'
            : '.') +
          '</div>' +
        '</div>'
    }).then(function (ok) {
      if (!ok) return;

      state.productos = state.productos.filter(function (x) { return x.id !== id; });
      guardarEstado();
      toast('success', 'Producto eliminado', p.codigo + ' — ' + p.descripcion);
      renderTodo();
    });
  }

  /* ===================== 10. AJUSTE DE STOCK ============================ */

  function abrirAjusteStock(id) {
    const p = state.productos.find(function (x) { return x.id === id; });
    if (!p) {
      toast('error', 'Producto no encontrado', 'Puede haber sido eliminado.');
      return;
    }

    ui.stockId = id;
    const form = $('#form-stock');
    limpiarErrores(form);

    $('#stock-codigo').textContent = p.codigo;
    $('#stock-descripcion').textContent = p.descripcion;
    $('#stock-cantidad').value = '1';
    $('#stock-motivo').value = '';

    actualizarPreviewStock();
    abrirModal($('#modal-stock'));
    setTimeout(function () { $('#stock-cantidad').select(); }, 30);
  }

  /** Cantidad válida ingresada en el modal de stock, o null si es inválida. */
  function cantidadStock() {
    const leido = leerNumero($('#stock-cantidad'));
    if (leido.error) return null;
    if (!Number.isInteger(leido.valor) || leido.valor < 1) return null;
    return leido.valor;
  }

  /** Muestra en vivo cómo queda el stock antes de confirmar. */
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
    // No se permite dejar el stock en negativo.
    $('#btn-stock-restar').disabled = qty > p.stock;

    $('#stock-resultado').textContent =
      fmtEntero(p.stock - qty) + ' (−) / ' + fmtEntero(p.stock + qty) + ' (+)';

    let aviso = '';
    if (qty > p.stock) {
      aviso = ' · No se puede restar más de ' + fmtEntero(p.stock) +
        (p.stock === 1 ? ' caja' : ' cajas');
    } else if (p.stock - qty <= p.stock_minimo) {
      aviso = ' · Restar deja el producto en alerta de stock bajo (mínimo ' +
        fmtEntero(p.stock_minimo) + ')';
    }
    $('#stock-aviso').textContent = aviso;
  }

  /** Aplica el movimiento y registra la fecha. */
  function aplicarAjusteStock(signo) {
    const i = state.productos.findIndex(function (x) { return x.id === ui.stockId; });
    if (i === -1) {
      toast('error', 'Producto no encontrado', 'No se pudo registrar el movimiento.');
      return;
    }

    const p = state.productos[i];
    const qty = cantidadStock();

    if (qty === null) {
      setError('stock-cantidad', 'Ingresá una cantidad entera de 1 o más.');
      $('#stock-cantidad').focus();
      return;
    }

    if (signo < 0 && qty > p.stock) {
      setError('stock-cantidad',
        'No podés restar ' + qty + ': el stock actual es ' + p.stock + '.');
      $('#stock-cantidad').focus();
      return;
    }

    setError('stock-cantidad', null);

    const motivo = $('#stock-motivo').value.trim();
    const ahora = new Date().toISOString();
    const nuevoStock = p.stock + signo * qty;

    state.productos[i] = Object.assign({}, p, {
      stock: nuevoStock,
      actualizado: ahora,
      ultimo_movimiento: ahora,
      ultimo_movimiento_detalle:
        (signo > 0 ? '+' : '−') + qty + (qty === 1 ? ' caja' : ' cajas') +
        (motivo ? ' · ' + motivo : '')
    });

    guardarEstado();
    cerrarModal($('#modal-stock'));

    const quedaBajo = nuevoStock <= state.productos[i].stock_minimo;
    toast(quedaBajo ? 'warning' : 'success',
      'Stock actualizado',
      p.codigo + ': ' + p.stock + ' → ' + nuevoStock + ' cajas' +
      (quedaBajo ? ' (en alerta de stock bajo)' : ''));

    ui.stockId = null;
    renderTodo();
  }

  /* ================ 11. EXPORTACIONES E IMPORTACIÓN ===================== */

  /** Escapa un campo de CSV según RFC 4180. */
  function campoCSV(valor, delim) {
    const s = String(valor == null ? '' : valor);
    if (s.indexOf(delim) !== -1 || s.indexOf('"') !== -1 ||
        s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * (a) CSV para Tango Gestión.
   * Columnas: COD_ARTICU, DESCRIPCIO, PRECIO_VTA (AR$ por unidad),
   * UNIDAD_MEDIDA, RUBRO. Decimales con punto y archivo con BOM UTF-8 para
   * que Excel respete los acentos.
   */
  function exportarTango() {
    if (!state.productos.length) {
      toast('warning', 'Nada para exportar', 'El catálogo está vacío.');
      return;
    }

    const delim = state.config.csvDelimitador;
    const cab = ['COD_ARTICU', 'DESCRIPCIO', 'PRECIO_VTA', 'UNIDAD_MEDIDA', 'RUBRO'];

    const lineas = [cab.join(delim)];

    state.productos.forEach(function (p) {
      lineas.push([
        campoCSV(p.codigo, delim),
        campoCSV(p.descripcion, delim),
        // Precio de venta por unidad, con punto decimal y 2 decimales.
        campoCSV(precioArsUnidad(p).toFixed(2), delim),
        campoCSV(state.config.unidadMedida, delim),
        campoCSV(p.sistema, delim)
      ].join(delim));
    });

    const contenido = '﻿' + lineas.join('\r\n') + '\r\n';
    descargar(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }),
      'IAC_tango_' + sufijoFecha() + '.csv');

    toast('success', 'CSV generado',
      state.productos.length + ' artículos exportados para Tango Gestión.');
  }

  /** (b) Backup completo en JSON. */
  function exportarJSON() {
    const payload = {
      app: 'IAC INTERNACIONAL SRL - Gestión de Stock',
      formato: 1,
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

  /** (c) Importar un backup JSON, con confirmación antes de reemplazar. */
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

      // Se acepta tanto el backup completo como un array suelto de productos.
      const crudos = Array.isArray(data) ? data
        : (data && Array.isArray(data.productos) ? data.productos : null);

      if (!crudos) {
        toast('error', 'Archivo inválido',
          'No se encontró una lista de productos en el archivo.');
        return;
      }

      const normalizados = crudos.map(normalizarProducto).filter(Boolean);
      const descartados = crudos.length - normalizados.length;

      if (!normalizados.length) {
        toast('error', 'Archivo sin productos válidos',
          'Cada producto necesita al menos código y descripción.');
        return;
      }

      // Se eliminan códigos repetidos, conservando la primera aparición.
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
        ? normalizarConfig(data.config)
        : null;

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
          '<div class="callout callout--danger">' +
            '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
            '<div>Se reemplazan los <strong>' + fmtEntero(state.productos.length) +
            '</strong> productos que tenés cargados ahora. Esta acción no se puede deshacer.</div>' +
          '</div>'
      }).then(function (ok) {
        if (!ok) {
          toast('info', 'Importación cancelada', 'No se modificó ningún dato.');
          return;
        }

        state.productos = unicos;
        if (cfg) state.config = cfg;

        guardarEstado();
        ui.pagina = 1;
        sincronizarConfigForm();
        renderTodo();

        toast('success', 'Backup restaurado',
          fmtEntero(unicos.length) + ' productos importados correctamente.');
      });
    };

    lector.readAsText(file, 'utf-8');
  }

  /** (d) Planilla .xlsx con todos los productos y un resumen. */
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
    const tc = state.config.tipoCambio;

    // --- Hoja 1: productos ---
    const filas = state.productos.map(function (p) {
      const v = valorStock(p);
      return {
        'Familia': p.familia,
        'Familia (nombre)': FAMILIA_NOMBRE[p.familia] || '',
        'Código': p.codigo,
        'Descripción': p.descripcion,
        'Sistema / Rubro': p.sistema,
        'Presentación (u/caja)': p.presentacion_caja,
        'Precio USD caja': p.precio_usd,
        'Precio AR$ caja': precioArsCaja(p),
        'Precio AR$ unidad': precioArsUnidad(p),
        'Stock (cajas)': p.stock,
        'Stock mínimo': p.stock_minimo,
        'Estado': p.stock === 0 ? 'SIN STOCK' : (esStockBajo(p) ? 'STOCK BAJO' : 'OK'),
        'Valor stock AR$': v.ars,
        'Valor stock USD': v.usd,
        'Último movimiento': p.ultimo_movimiento ? fmtFechaHora(p.ultimo_movimiento) : '',
        'Detalle movimiento': p.ultimo_movimiento_detalle || '',
        'Observaciones': p.observaciones
      };
    });

    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [
      { wch: 8 }, { wch: 24 }, { wch: 12 }, { wch: 52 }, { wch: 18 }, { wch: 12 },
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 36 }
    ];
    hoja['!autofilter'] = { ref: hoja['!ref'] };

    // --- Hoja 2: resumen ---
    const t = totales();
    const resumen = [
      { Concepto: 'Empresa', Valor: 'IAC INTERNACIONAL SRL' },
      { Concepto: 'Reporte', Valor: 'Inventario y lista de precios' },
      { Concepto: 'Generado', Valor: fmtFechaHora(new Date().toISOString()) },
      { Concepto: 'Tipo de cambio (AR$/USD)', Valor: tc },
      { Concepto: 'Total de productos', Valor: t.productos },
      { Concepto: 'Cajas en stock', Valor: t.cajas },
      { Concepto: 'Productos con stock bajo', Valor: t.bajo },
      { Concepto: 'Productos sin stock', Valor: t.cero },
      { Concepto: 'Valor inventario AR$', Valor: t.valorArs },
      { Concepto: 'Valor inventario USD', Valor: t.valorUsd },
      { Concepto: '', Valor: '' },
      { Concepto: 'DISTRIBUCIÓN POR FAMILIA', Valor: '' }
    ];

    agrupar('familia')
      .sort(function (a, b) { return b.productos - a.productos; })
      .forEach(function (g) {
        resumen.push({
          Concepto: g.sigla + ' — ' + g.etiqueta,
          Valor: g.productos + ' productos · ' + g.cajas + ' cajas · AR$ ' + fmtDecimal(g.valor)
        });
      });

    resumen.push({ Concepto: '', Valor: '' });
    resumen.push({ Concepto: 'DISTRIBUCIÓN POR SISTEMA / RUBRO', Valor: '' });

    agrupar('sistema')
      .sort(function (a, b) { return b.productos - a.productos; })
      .forEach(function (g) {
        resumen.push({
          Concepto: g.etiqueta,
          Valor: g.productos + ' productos · ' + g.cajas + ' cajas · AR$ ' + fmtDecimal(g.valor)
        });
      });

    const hojaResumen = XLSX.utils.json_to_sheet(resumen);
    hojaResumen['!cols'] = [{ wch: 40 }, { wch: 52 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
    XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

    XLSX.writeFile(libro, 'IAC_stock_' + sufijoFecha() + '.xlsx');

    toast('success', 'Excel generado',
      state.productos.length + ' productos exportados a .xlsx.');
  }

  /* ==================== 12. VISTA: CONFIGURACIÓN ======================== */

  /** Carga los valores actuales en el formulario de configuración. */
  function sincronizarConfigForm() {
    $('#cfg-tc').value = String(state.config.tipoCambio);
    $('#cfg-stock-min').value = String(state.config.stockMinimoDefault);
    $('#cfg-unidad').value = state.config.unidadMedida;
    $('#cfg-delim').value = state.config.csvDelimitador;
  }

  function guardarConfig() {
    const form = $('#form-config');
    limpiarErrores(form);

    let primerError = null;
    const fallar = function (campo, mensaje) {
      setError(campo, mensaje);
      if (!primerError) primerError = campo;
    };

    // --- Tipo de cambio ---
    const tcLeido = leerNumero($('#cfg-tc'));
    let tc = state.config.tipoCambio;
    if (tcLeido.error === 'vacio') {
      fallar('cfg-tc', 'El tipo de cambio es obligatorio.');
    } else if (tcLeido.error) {
      fallar('cfg-tc', 'Ingresá un número válido.');
    } else if (!(tcLeido.valor > 0)) {
      fallar('cfg-tc', 'Debe ser mayor que 0.');
    } else {
      tc = tcLeido.valor;
    }

    // --- Stock mínimo por defecto ---
    const minLeido = leerNumero($('#cfg-stock-min'));
    let min = state.config.stockMinimoDefault;
    if (minLeido.error === 'vacio') {
      fallar('cfg-stock-min', 'El stock mínimo es obligatorio.');
    } else if (minLeido.error) {
      fallar('cfg-stock-min', 'Ingresá un número válido.');
    } else if (!Number.isInteger(minLeido.valor) || minLeido.valor < 0) {
      fallar('cfg-stock-min', 'Debe ser un entero de 0 o más.');
    } else {
      min = minLeido.valor;
    }

    // --- Unidad de medida ---
    const unidad = $('#cfg-unidad').value.trim();
    if (!unidad) fallar('cfg-unidad', 'La unidad de medida es obligatoria.');

    if (primerError) {
      const el = document.getElementById(primerError);
      if (el) el.focus();
      toast('error', 'Revisá la configuración', 'Hay valores que no son válidos.');
      return;
    }

    const tcAnterior = state.config.tipoCambio;

    state.config = normalizarConfig({
      tipoCambio: tc,
      stockMinimoDefault: min,
      unidadMedida: unidad,
      csvDelimitador: $('#cfg-delim').value
    });

    guardarEstado();
    sincronizarConfigForm();
    renderTodo();

    if (tcAnterior !== state.config.tipoCambio) {
      toast('success', 'Tipo de cambio actualizado',
        'De ' + fmtDecimal(tcAnterior) + ' a ' + fmtDecimal(state.config.tipoCambio) +
        '. Se recalcularon todos los precios en AR$.');
    } else {
      toast('success', 'Configuración guardada', 'Los cambios ya están aplicados.');
    }
  }

  /** Vuelve al catálogo inicial de 128 productos, con confirmación. */
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
          'actuales, con su stock y sus observaciones, y se va a volver al catálogo original de ' +
          PRODUCTOS_INICIALES.length + ' productos con stock en 0.</div>' +
        '</div>' +
        '<div class="callout callout--warning">' +
          '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
          '<div>Si todavía no descargaste un backup JSON, cancelá y hacelo primero: ' +
          'esta acción no se puede deshacer.</div>' +
        '</div>'
    }).then(function (ok) {
      if (!ok) return;

      state = estadoInicial();
      guardarEstado();

      ui.pagina = 1;
      ui.busqueda = '';
      ui.familia = '';
      ui.sistema = '';
      ui.stock = 'todos';
      ui.sortKey = null;

      sincronizarFiltrosForm();
      sincronizarConfigForm();
      renderTodo();

      toast('success', 'Catálogo restablecido',
        PRODUCTOS_INICIALES.length + ' productos cargados con stock en 0.');
    });
  }

  /** Información sobre el espacio ocupado en el navegador. */
  function renderStorageInfo() {
    const bytes = tamanoAlmacenado();
    const kb = bytes / 1024;
    const resumen = fmtEntero(state.productos.length) + ' productos · ' +
      (kb >= 1024 ? fmtDecimal(kb / 1024) + ' MB' : fmtDecimal(kb) + ' KB');

    $('#storage-info').textContent = resumen;

    const detalle = $('#cfg-storage-detalle');
    if (detalle) {
      detalle.innerHTML =
        'Clave <code>' + esc(STORAGE_KEY) + '</code> del localStorage · ' +
        esc(resumen) + '.<br>' +
        'Los precios en AR$ no se almacenan: se calculan con el tipo de cambio ' +
        'vigente (<strong>' + esc(fmtDecimal(state.config.tipoCambio)) + '</strong>) cada vez que se muestran.';
    }
  }

  /* ============== 13. NAVEGACIÓN, TEMA Y ARRANQUE ======================= */

  const VISTAS = ['dashboard', 'productos', 'exportar', 'configuracion'];

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
      if (activo) {
        b.setAttribute('aria-current', 'page');
      } else {
        b.removeAttribute('aria-current');
      }
    });

    cerrarSidebarMobile();
    window.scrollTo({ top: 0, behavior: 'auto' });

    // El gráfico necesita un ancho medible: al mostrarse la vista ya lo tiene.
    if (vista === 'dashboard') renderChart();
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

  /** Tema efectivo: el elegido por el usuario o, si no eligió, el del sistema. */
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
      btn.setAttribute('aria-label',
        tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    }

    // Los colores del gráfico vienen de variables CSS: basta con redibujarlo.
    if (ui.vista === 'dashboard') renderChart();
  }

  /** Repinta todo lo que depende de los datos. */
  function renderTodo() {
    renderDashboard();
    renderProductos();
    renderStorageInfo();
    $('#header-rate').textContent = fmtDecimal(state.config.tipoCambio);
  }

  /** Vuelve a dibujar los selects de filtros con los valores vigentes. */
  function sincronizarFiltrosForm() {
    llenarSelect($('#f-familia'), opcionesFamilia(), 'Todas');
    llenarSelect($('#f-sistema'), opcionesSistema(), 'Todos');
    $('#f-busqueda').value = ui.busqueda;
    $('#f-familia').value = ui.familia;
    $('#f-sistema').value = ui.sistema;
    $('#f-stock').value = ui.stock;
  }

  /** Debounce sencillo, para la búsqueda y el resize. */
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function conectarEventos() {

    // ---- Navegación ----
    $$('.nav-item[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { navegar(b.getAttribute('data-nav')); });
    });

    $('#btn-hamburger').addEventListener('click', function () {
      if ($('#sidebar').classList.contains('is-open')) cerrarSidebarMobile();
      else abrirSidebarMobile();
    });

    $('#backdrop').addEventListener('click', cerrarSidebarMobile);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') cerrarSidebarMobile();
    });

    // ---- Tema ----
    $('#btn-theme').addEventListener('click', function () {
      aplicarTema(temaEfectivo() === 'dark' ? 'light' : 'dark');
    });

    // ---- Acciones globales (delegación de eventos) ----
    document.addEventListener('click', function (ev) {
      const btn = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!btn) return;

      const accion = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      switch (accion) {
        case 'nuevo-producto':
          cerrarSidebarMobile();
          abrirFormProducto(null);
          break;
        case 'editar':
          abrirFormProducto(id);
          break;
        case 'eliminar':
          eliminarProducto(id);
          break;
        case 'ajustar-stock':
          abrirAjusteStock(id);
          break;
        case 'ver-stock-bajo':
          ui.stock = 'bajo';
          ui.pagina = 1;
          sincronizarFiltrosForm();
          navegar('productos');
          renderProductos();
          break;
        case 'export-tango':
          exportarTango();
          break;
        case 'export-json':
          exportarJSON();
          break;
        case 'export-excel':
          exportarExcel();
          break;
        case 'import-json':
          $('#input-import').click();
          break;
        case 'reset-datos':
          resetDatos();
          break;
      }
    });

    // Cierre de modales por el botón o el fondo
    $$('dialog.modal').forEach(function (dlg) {
      $$('[data-close]', dlg).forEach(function (b) {
        b.addEventListener('click', function () { cerrarModal(dlg); });
      });
      // Clic fuera del contenido: el <dialog> recibe el clic en su backdrop.
      dlg.addEventListener('click', function (ev) {
        if (ev.target === dlg) cerrarModal(dlg);
      });
    });

    // ---- Formulario de producto ----
    $('#form-producto').addEventListener('submit', function (ev) {
      ev.preventDefault();
      guardarProducto();
    });

    ['#p-precio-usd', '#p-presentacion'].forEach(function (sel) {
      $(sel).addEventListener('input', recalcularPreciosForm);
    });

    $('#p-observaciones').addEventListener('input', function () {
      $('#p-obs-count').textContent = String($('#p-observaciones').value.length);
    });

    // Al corregir un campo con error, el mensaje desaparece solo.
    $$('#form-producto input, #form-producto select, #form-producto textarea')
      .forEach(function (inp) {
        inp.addEventListener('input', function () {
          if (inp.id) setError(inp.id, null);
        });
      });

    // ---- Modal de stock ----
    $('#form-stock').addEventListener('submit', function (ev) {
      ev.preventDefault();          // Enter en el formulario = sumar
      aplicarAjusteStock(1);
    });

    $('#btn-stock-restar').addEventListener('click', function () {
      aplicarAjusteStock(-1);
    });

    $('#stock-menos').addEventListener('click', function () {
      const n = Math.max(1, (cantidadStock() || 1) - 1);
      $('#stock-cantidad').value = String(n);
      actualizarPreviewStock();
    });

    $('#stock-mas').addEventListener('click', function () {
      const n = (cantidadStock() || 0) + 1;
      $('#stock-cantidad').value = String(n);
      actualizarPreviewStock();
    });

    $('#stock-cantidad').addEventListener('input', function () {
      setError('stock-cantidad', null);
      actualizarPreviewStock();
    });

    $$('.quick-chips button[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#stock-cantidad').value = b.getAttribute('data-qty');
        setError('stock-cantidad', null);
        actualizarPreviewStock();
      });
    });

    // ---- Filtros de la tabla ----
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
      ui.busqueda = '';
      ui.familia = '';
      ui.sistema = '';
      ui.stock = 'todos';
      ui.pagina = 1;
      sincronizarFiltrosForm();
      renderProductos();
    });

    // ---- Ordenamiento ----
    $$('#tabla-productos th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.getAttribute('data-sort');
        if (ui.sortKey === key) {
          ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          ui.sortKey = key;
          ui.sortDir = 'asc';
        }
        ui.pagina = 1;
        renderProductos();
      });

      // Accesible por teclado: los th de ordenamiento se enfocan y activan.
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'columnheader');
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          th.click();
        }
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
      // Se limpia para poder volver a elegir el mismo archivo.
      ev.target.value = '';
    });

    // ---- Configuración ----
    $('#form-config').addEventListener('submit', function (ev) {
      ev.preventDefault();
      guardarConfig();
    });

    $('#btn-config-reset-form').addEventListener('click', function () {
      const def = configPorDefecto();
      $('#cfg-tc').value = String(def.tipoCambio);
      $('#cfg-stock-min').value = String(def.stockMinimoDefault);
      $('#cfg-unidad').value = def.unidadMedida;
      $('#cfg-delim').value = def.csvDelimitador;
      limpiarErrores($('#form-config'));
      toast('info', 'Valores por defecto cargados', 'Tocá “Guardar cambios” para aplicarlos.');
    });

    $$('#form-config input, #form-config select').forEach(function (inp) {
      inp.addEventListener('input', function () {
        if (inp.id) setError(inp.id, null);
      });
    });

    // ---- Controles del dashboard ----
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

    $$('[data-dash-moneda]').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.dashMoneda = b.getAttribute('data-dash-moneda');
        $$('[data-dash-moneda]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        // Se reordenan las tarjetas de valor para destacar la moneda elegida.
        const grid = $('.kpi-grid');
        const ars = $('#kpi-valor-ars').closest('.kpi');
        const usd = $('#kpi-valor-usd').closest('.kpi');
        if (grid && ars && usd) {
          if (ui.dashMoneda === 'USD') grid.insertBefore(usd, ars);
          else grid.insertBefore(ars, usd);
        }
      });
    });

    // El SVG se dibuja a escala 1:1, así que hay que redibujarlo al cambiar
    // el ancho. Se compara contra el último ancho usado para no entrar en bucle.
    const alRedimensionar = debounce(function () {
      if (ui.vista !== 'dashboard') return;
      const ancho = Math.floor($('#chart').clientWidth);
      if (Math.abs(ancho - ui.chartAnchoRenderizado) > 8) renderChart();
    }, 140);

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(alRedimensionar).observe($('#chart'));
    }
    window.addEventListener('resize', alRedimensionar);

    // Si el sistema cambia de tema y el usuario no eligió uno, se redibuja.
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const alCambiarMQ = function () {
        if (ui.vista === 'dashboard') renderChart();
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', alCambiarMQ);
      else if (typeof mq.addListener === 'function') mq.addListener(alCambiarMQ);
    }

    // Mantiene sincronizadas dos pestañas abiertas sobre el mismo navegador.
    window.addEventListener('storage', function (ev) {
      if (ev.key !== STORAGE_KEY) return;
      cargarEstado();
      sincronizarFiltrosForm();
      sincronizarConfigForm();
      renderTodo();
      toast('info', 'Datos actualizados', 'Se recargaron los cambios hechos en otra pestaña.');
    });
  }

  /** Arranque de la aplicación. */
  function init() {
    cargarEstado();

    // El tema ya se aplicó en el <head> para evitar el parpadeo; acá sólo se
    // sincronizan el ícono y el aria-label del botón.
    aplicarTema(temaEfectivo());

    sincronizarFiltrosForm();
    sincronizarConfigForm();
    conectarEventos();
    navegar('dashboard');
    renderTodo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
