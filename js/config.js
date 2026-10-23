/**
 * config.js — Conexión con Supabase.
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE TENÉS QUE EDITAR PARA ACTIVAR LA SINCRONIZACIÓN
 * ENTRE EL CELULAR Y LAS COMPUTADORAS.
 *
 * Mientras los dos valores sigan vacíos, la aplicación funciona igual que
 * antes: guarda todo en el navegador y cada dispositivo tiene su propia copia.
 *
 * ---------------------------------------------------------------------------
 * CÓMO COMPLETARLO
 *
 * 1. Entrá a https://supabase.com y creá un proyecto (plan gratuito).
 * 2. En el panel del proyecto: Settings (el engranaje) → API.
 * 3. Copiá los dos valores:
 *      - "Project URL"        -> va en SUPABASE_URL
 *      - "anon" / "public"    -> va en SUPABASE_ANON_KEY
 * 4. Pegalos abajo entre las comillas, guardá y subí el cambio a GitHub.
 *
 * ---------------------------------------------------------------------------
 * ¿ES SEGURO QUE ESTA CLAVE ESTÉ A LA VISTA?
 *
 * Sí. La clave "anon" está pensada para vivir en el navegador y no da acceso
 * por sí sola: la protección real son las políticas de seguridad (RLS) que
 * crea el archivo supabase/schema.sql, que exigen haber iniciado sesión para
 * leer o escribir cualquier dato.
 *
 * Lo que NUNCA hay que poner acá es la clave "service_role": esa sí saltea
 * todas las protecciones. Si alguna vez la pegás por error, andá al panel de
 * Supabase y regenerala de inmediato.
 */

/** URL del proyecto. Ejemplo: 'https://abcdefghijklm.supabase.co' */
const SUPABASE_URL = '';

/** Clave pública "anon". Es un texto largo que empieza con 'eyJ...'. */
const SUPABASE_ANON_KEY = '';
