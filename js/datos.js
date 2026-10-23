/**
 * datos.js — Capa de datos y de sesión.
 *
 * Toda la aplicación le pide los datos a este módulo y nunca toca Supabase ni
 * el localStorage directamente. Así el resto del código no cambia según dónde
 * estén guardados los datos.
 *
 * Hay dos modos de funcionamiento:
 *
 *   'local'  No hay Supabase configurado (js/config.js vacío). Todo se guarda
 *            en el navegador, como antes. Cada dispositivo tiene su copia.
 *
 *   'nube'   Hay Supabase configurado. Hace falta iniciar sesión y todos los
 *            dispositivos comparten los mismos datos, que se actualizan solos
 *            cuando alguien cambia algo.
 *
 * En modo nube el localStorage se sigue usando, pero sólo como copia de
 * respaldo para poder mostrar algo si se corta internet. La verdad está
 * siempre en la nube.
 *
 * El stock se maneja SIEMPRE EN UNIDADES.
 */

'use strict';

const Datos = (function () {

  /** Clave del localStorage (v2: el stock pasó de cajas a unidades). */
  const CACHE_KEY = 'iac_stock_v2';

  /** Clave vieja (v1, stock en cajas). Sólo se usa para avisar y limpiar. */
  const CACHE_KEY_V1 = 'iac_stock_v1';

  const estado = {
    modo: 'local',
    cliente: null,
    usuario: null,
    canal: null,
    conectado: true
  };

  /* ===================== CONFIGURACIÓN / ARRANQUE ======================= */

  /** true si js/config.js fue completado con datos que parecen válidos. */
  function hayConfiguracion() {
    return typeof SUPABASE_URL === 'string' &&
           typeof SUPABASE_ANON_KEY === 'string' &&
           /^https:\/\/.+\.supabase\.(co|in)$/.test(SUPABASE_URL.trim()) &&
           SUPABASE_ANON_KEY.trim().length > 40;
  }

  /**
   * Arranca el módulo. Devuelve el modo en el que quedó y, si corresponde, la
   * sesión que ya estaba abierta.
   */
  async function iniciar() {
    // La v1 guardaba el stock en cajas. Como el criterio cambió a unidades, no
    // se puede reinterpretar sin inventar datos: se descarta y se avisa.
    let habiaV1 = false;
    try {
      habiaV1 = !!window.localStorage.getItem(CACHE_KEY_V1);
      if (habiaV1) window.localStorage.removeItem(CACHE_KEY_V1);
    } catch (e) { /* almacenamiento bloqueado */ }

    if (!hayConfiguracion()) {
      estado.modo = 'local';
      return { modo: 'local', usuario: null, habiaV1: habiaV1 };
    }

    if (typeof window.supabase === 'undefined' ||
        typeof window.supabase.createClient !== 'function') {
      // La librería no cargó: se sigue en local para no dejar la app inservible.
      estado.modo = 'local';
      return {
        modo: 'local',
        usuario: null,
        habiaV1: habiaV1,
        error: 'No se pudo cargar la librería de Supabase. ' +
               'La aplicación va a funcionar sólo en este dispositivo.'
      };
    }

    try {
      estado.cliente = window.supabase.createClient(
        SUPABASE_URL.trim(),
        SUPABASE_ANON_KEY.trim(),
        { auth: { persistSession: true, autoRefreshToken: true } }
      );
    } catch (e) {
      estado.modo = 'local';
      return {
        modo: 'local', usuario: null, habiaV1: habiaV1,
        error: 'La configuración de Supabase no es válida: ' + e.message
      };
    }

    estado.modo = 'nube';

    const { data } = await estado.cliente.auth.getSession();
    estado.usuario = data && data.session ? data.session.user : null;

    return { modo: 'nube', usuario: estado.usuario, habiaV1: habiaV1 };
  }

  /* =========================== SESIÓN =================================== */

  async function iniciarSesion(email, password) {
    if (estado.modo !== 'nube') throw new Error('La sincronización no está configurada.');

    const { data, error } = await estado.cliente.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password)
    });

    if (error) throw new Error(traducirErrorAuth(error));
    estado.usuario = data.user;
    return data.user;
  }

  async function cerrarSesion() {
    if (estado.modo !== 'nube') return;
    desuscribir();
    try { await estado.cliente.auth.signOut(); } catch (e) { /* da igual */ }
    estado.usuario = null;
    // La copia local se borra para no dejar datos de la empresa en un equipo
    // del que alguien se acaba de desconectar.
    try { window.localStorage.removeItem(CACHE_KEY); } catch (e) { /* nada */ }
  }

  /** Mensajes de Supabase traducidos a algo que se entienda. */
  function traducirErrorAuth(error) {
    const m = String(error.message || '').toLowerCase();
    if (m.indexOf('invalid login') !== -1 || m.indexOf('invalid credentials') !== -1) {
      return 'El mail o la contraseña no son correctos.';
    }
    if (m.indexOf('email not confirmed') !== -1) {
      return 'El usuario todavía no confirmó su mail. Confirmalo desde el panel de Supabase.';
    }
    if (m.indexOf('rate limit') !== -1 || m.indexOf('too many') !== -1) {
      return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
    }
    if (m.indexOf('failed to fetch') !== -1 || m.indexOf('network') !== -1) {
      return 'No hay conexión con el servidor. Revisá internet.';
    }
    return error.message || 'No se pudo iniciar sesión.';
  }

  function usuarioActual() { return estado.usuario; }
  function modo() { return estado.modo; }
  function necesitaSesion() { return estado.modo === 'nube' && !estado.usuario; }
  function estaConectado() { return estado.conectado; }

  /* ====================== CACHÉ EN EL NAVEGADOR ========================= */

  function leerCache() {
    try {
      const s = window.localStorage.getItem(CACHE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  function escribirCache(datos) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(datos));
      return true;
    } catch (e) {
      return false;
    }
  }

  function tamanoCache() {
    try {
      const s = window.localStorage.getItem(CACHE_KEY);
      return s ? s.length : 0;
    } catch (e) {
      return 0;
    }
  }

  /* ==================== CONVERSIÓN FILA <-> OBJETO ====================== */

  /** De una fila de Supabase al objeto que usa la aplicación. */
  function desdeFila(f) {
    return {
      id: f.id,
      codigo: f.codigo,
      descripcion: f.descripcion,
      familia: f.familia,
      sistema: f.sistema,
      presentacion_caja: Number(f.presentacion_caja) || 1,
      precio_usd: Number(f.precio_usd) || 0,
      stock: Number(f.stock) || 0,
      stock_minimo: Number(f.stock_minimo) || 0,
      observaciones: f.observaciones || '',
      ultimo_movimiento: f.ultimo_movimiento || null,
      ultimo_movimiento_detalle: f.ultimo_movimiento_detalle || null,
      actualizado_por: f.actualizado_por || null,
      creado: f.creado_en || null,
      actualizado: f.actualizado_en || null
    };
  }

  /** Del objeto de la aplicación a una fila de Supabase. */
  function haciaFila(p) {
    return {
      id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      familia: p.familia,
      sistema: p.sistema,
      presentacion_caja: p.presentacion_caja,
      precio_usd: p.precio_usd,
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      observaciones: p.observaciones || '',
      ultimo_movimiento: p.ultimo_movimiento,
      ultimo_movimiento_detalle: p.ultimo_movimiento_detalle,
      actualizado_por: estado.usuario ? estado.usuario.email : null
    };
  }

  function configDesdeFila(f) {
    return {
      tipoCambio: Number(f.tipo_cambio) || 1500,
      stockMinimoDefault: Number(f.stock_minimo_default) || 5,
      unidadMedida: f.unidad_medida || 'UNIDAD',
      csvDelimitador: f.csv_delimitador || ';'
    };
  }

  /* ========================= LECTURA / ESCRITURA ======================== */

  /**
   * Trae todo desde la nube. En modo local devuelve null para que la
   * aplicación use su propia copia.
   */
  async function cargarTodo() {
    if (estado.modo !== 'nube' || !estado.usuario) return null;

    // Supabase pagina de a 1000 filas por defecto; el catálogo es más chico,
    // pero se pide explícito por si el día de mañana crece.
    const prodRes = await estado.cliente
      .from('productos')
      .select('*')
      .order('codigo', { ascending: true })
      .range(0, 4999);

    if (prodRes.error) throw errorLegible(prodRes.error, 'leer los productos');

    const cfgRes = await estado.cliente
      .from('config').select('*').eq('id', 1).maybeSingle();

    if (cfgRes.error) throw errorLegible(cfgRes.error, 'leer la configuración');

    estado.conectado = true;

    return {
      productos: (prodRes.data || []).map(desdeFila),
      config: cfgRes.data ? configDesdeFila(cfgRes.data) : null
    };
  }

  /** Alta o modificación de un producto. */
  async function guardarProducto(p) {
    if (estado.modo !== 'nube') return p;

    const { data, error } = await estado.cliente
      .from('productos')
      .upsert(haciaFila(p), { onConflict: 'id' })
      .select()
      .single();

    if (error) throw errorLegible(error, 'guardar el producto');
    return desdeFila(data);
  }

  /** Carga inicial del catálogo cuando la base en la nube está vacía. */
  async function sembrarCatalogo(productos) {
    if (estado.modo !== 'nube') return 0;

    const filas = productos.map(haciaFila);
    let insertados = 0;

    // De a tandas, para no mandar un cuerpo enorme en un solo pedido.
    for (let i = 0; i < filas.length; i += 50) {
      const tanda = filas.slice(i, i + 50);
      const { data, error } = await estado.cliente
        .from('productos')
        .upsert(tanda, { onConflict: 'id' })
        .select('id');

      if (error) throw errorLegible(error, 'cargar el catálogo inicial');
      insertados += (data || []).length;
    }

    return insertados;
  }

  async function eliminarProducto(id) {
    if (estado.modo !== 'nube') return;

    const { error } = await estado.cliente.from('productos').delete().eq('id', id);
    if (error) throw errorLegible(error, 'eliminar el producto');
  }

  async function guardarConfig(cfg) {
    if (estado.modo !== 'nube') return;

    const { error } = await estado.cliente.from('config').upsert({
      id: 1,
      tipo_cambio: cfg.tipoCambio,
      stock_minimo_default: cfg.stockMinimoDefault,
      unidad_medida: cfg.unidadMedida,
      csv_delimitador: cfg.csvDelimitador
    }, { onConflict: 'id' });

    if (error) throw errorLegible(error, 'guardar la configuración');
  }

  /**
   * Deja asentado un movimiento de stock en el historial.
   * Si falla no se corta la operación: el stock ya quedó guardado y el
   * historial es información complementaria.
   */
  async function registrarMovimiento(p, delta, motivo) {
    if (estado.modo !== 'nube') return;

    try {
      await estado.cliente.from('movimientos').insert({
        producto_id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        delta: delta,
        stock_resultante: p.stock,
        motivo: motivo || null,
        usuario: estado.usuario ? estado.usuario.email : null
      });
    } catch (e) { /* el historial es opcional */ }
  }

  /** Últimos movimientos, para la pantalla de historial. */
  async function ultimosMovimientos(limite) {
    if (estado.modo !== 'nube' || !estado.usuario) return [];

    const { data, error } = await estado.cliente
      .from('movimientos')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(limite || 50);

    if (error) return [];
    return data || [];
  }

  /* ========================== TIEMPO REAL =============================== */

  /**
   * Avisa cuando alguien cambia algo desde otro dispositivo.
   * El callback recibe ('productos'|'config', payload).
   */
  function suscribirCambios(callback) {
    if (estado.modo !== 'nube' || !estado.usuario) return;
    desuscribir();

    estado.canal = estado.cliente
      .channel('iac-stock')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'productos' },
          function (payload) { callback('productos', payload); })
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'config' },
          function (payload) { callback('config', payload); })
      .subscribe();
  }

  function desuscribir() {
    if (estado.canal) {
      try { estado.cliente.removeChannel(estado.canal); } catch (e) { /* nada */ }
      estado.canal = null;
    }
  }

  /* ============================ ERRORES ================================= */

  /** Convierte los errores de Supabase en algo accionable para el usuario. */
  function errorLegible(error, accion) {
    const msg = String(error.message || '');
    const code = String(error.code || '');

    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      estado.conectado = false;
      return new Error('Sin conexión: no se pudo ' + accion + '. ' +
        'Revisá internet y volvé a intentar.');
    }
    if (code === '23505' || /duplicate key/i.test(msg)) {
      return new Error('Ya existe un producto con ese código.');
    }
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
      return new Error('Tu usuario no tiene permiso para ' + accion + '. ' +
        'Verificá que ejecutaste supabase/schema.sql completo.');
    }
    if (code === '42P01' || /does not exist/i.test(msg)) {
      return new Error('Faltan las tablas en Supabase. ' +
        'Ejecutá el archivo supabase/schema.sql en el SQL Editor.');
    }
    if (/jwt|token/i.test(msg)) {
      return new Error('La sesión venció. Volvé a iniciar sesión.');
    }
    return new Error('No se pudo ' + accion + ': ' + msg);
  }

  /* ============================= API ==================================== */

  return {
    CACHE_KEY: CACHE_KEY,
    iniciar: iniciar,
    hayConfiguracion: hayConfiguracion,
    modo: modo,
    usuarioActual: usuarioActual,
    necesitaSesion: necesitaSesion,
    estaConectado: estaConectado,
    iniciarSesion: iniciarSesion,
    cerrarSesion: cerrarSesion,
    leerCache: leerCache,
    escribirCache: escribirCache,
    tamanoCache: tamanoCache,
    cargarTodo: cargarTodo,
    guardarProducto: guardarProducto,
    sembrarCatalogo: sembrarCatalogo,
    eliminarProducto: eliminarProducto,
    guardarConfig: guardarConfig,
    registrarMovimiento: registrarMovimiento,
    ultimosMovimientos: ultimosMovimientos,
    suscribirCambios: suscribirCambios,
    desuscribir: desuscribir
  };

})();
