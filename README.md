# IAC INTERNACIONAL SRL — Sistema de Gestión de Stock

Aplicación web de gestión de stock para **IAC INTERNACIONAL SRL**. Es una SPA
estática (HTML + CSS + JavaScript vanilla) que se publica en GitHub Pages.

- **El stock se cuenta en UNIDADES.** La presentación (unidades por caja) sólo
  se usa para calcular precios y para mostrar la equivalencia en cajas.
- **Funciona en dos modos.** Sin configurar, guarda todo en el navegador. Con
  Supabase configurado, los datos se comparten entre el celular y todas las
  computadoras, con usuario y contraseña.

---

## 1. Publicar en GitHub Pages

**Settings → Pages → Deploy from a branch →** rama del proyecto, carpeta `/ (root)`.

En uno o dos minutos la app queda en `https://<usuario>.github.io/<repositorio>/`.

Para probarla localmente:

```bash
python3 -m http.server 8080    # luego abrir http://localhost:8080
```

---

## 2. Activar la sincronización entre dispositivos

Mientras `js/config.js` esté vacío, la app anda igual pero **cada dispositivo
tiene su propia copia**: lo que cargás en el celular no aparece en la PC.

Para que todos vean el mismo stock hay que crear una base en Supabase. Es
gratis y lleva unos diez minutos, **una sola vez**.

### Paso 1 — Crear la organización y el proyecto

1. Entrá a <https://supabase.com> y creá una cuenta (podés usar tu cuenta de GitHub).
2. La primera vez te pide crear una **organización** antes que nada:
   **New organization** →
   - **Name**: `IAC INTERNACIONAL` (es sólo un rótulo interno)
   - **Type**: `Company` o `Personal`, da igual
   - **Plan**: **Free — $0/month**
3. Ya dentro de la organización: **New project**. Completá:
   - **Project name**: `iac-stock`
   - **Database Password**: usá *Generate a password* y **guardala** en un lugar
     seguro. No hace falta para la app, pero no se puede recuperar después.
   - **Region**: `South America (São Paulo)`, que es la más cercana.
4. **Create new project** y esperá un par de minutos a que termine de armarse.

### Paso 2 — Crear las tablas

> Si el navegador te traduce la página automáticamente, desactivalo para esta
> parte (clic derecho → *Mostrar siempre en inglés*). Las traducciones
> automáticas renombran los botones y es fácil equivocarse.

1. En el menú lateral: **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/schema.sql` de este repositorio, copiá **todo** el
   contenido y pegalo en el editor.
3. **Run**.

Al final tenés que ver una tabla con `productos`, `config` y `movimientos`, las
tres con `rls_activo = true`. Si alguna dice `false`, volvé a ejecutar el script.

### Paso 3 — Cerrar el registro público

Por defecto Supabase deja que cualquiera cree una cuenta. Como la dirección de
la app es pública, **hay que desactivarlo**:

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Desactivá **Allow new users to sign up** (puede figurar como *Enable sign ups*).
3. Guardá.

A partir de ahí los usuarios los creás sólo vos, a mano.

### Paso 4 — Crear los usuarios

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Poné el mail y una contraseña.
3. Marcá **Auto Confirm User**, así puede entrar sin confirmar el mail.
4. Repetí por cada persona que vaya a usar el sistema.

Todos los usuarios ven y editan **el mismo stock**: es el inventario de la
empresa, no uno por persona. Lo que cambia es que cada movimiento queda firmado
con el mail de quien lo hizo.

### Paso 5 — Conectar la app

1. En Supabase: **Settings** (el engranaje) → **API**.
2. Copiá dos valores:
   - **Project URL** → por ejemplo `https://abcdefghijklm.supabase.co`
   - **anon public** → un texto largo que empieza con `eyJ...`
3. Abrí `js/config.js` en este repositorio y pegalos:

```js
const SUPABASE_URL = 'https://abcdefghijklm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...';
```

4. Guardá, hacé commit y push. GitHub Pages se actualiza solo en un minuto.

### Paso 6 — Primer ingreso

Entrá a la app: ahora pide usuario y contraseña. La primera vez te va a avisar
que la base está vacía y te ofrece cargar los 128 productos del catálogo, todos
con **0 unidades**. Aceptá, y desde ese momento el celular y las computadoras
ven exactamente lo mismo.

> **¿Es seguro que la clave `anon` esté a la vista en el repositorio?**
> Sí. Está pensada para vivir en el navegador y por sí sola no da acceso a
> nada: las políticas de seguridad (RLS) que crea `supabase/schema.sql` exigen
> haber iniciado sesión. Lo que **nunca** hay que publicar es la clave
> `service_role`, que saltea todas las protecciones.

---

## 3. Cómo cargar el stock

Hay tres formas, de la más rápida a la más detallada:

| Forma | Dónde | Para qué sirve |
|---|---|---|
| **Carga rápida** | Menú → *Carga rápida* | Cargar muchos productos seguidos. Escribís el código, `Enter`, las unidades, `Enter`, y el foco vuelve solo al buscador. Es la forma de cargar el inventario inicial. |
| **Clic sobre el número** | Tabla de *Productos* | Corregir un producto puntual. Un clic sobre el stock lo convierte en un campo, escribís y `Enter`. |
| **Movimiento de stock** | Botón ⇄ de cada fila | Entradas y salidas del día a día. Suma o resta unidades, permite anotar un motivo y tiene atajos de "1 caja" según la presentación. |

En *Carga rápida* hay tres acciones:

- **Dejar en** — el stock queda en el número que pongas (para un recuento).
- **Sumar** — ingreso de mercadería.
- **Restar** — salida. Nunca deja el stock en negativo.

---

## 4. Estructura del proyecto

```
index.html                     Única página: login, vistas y modales
css/styles.css                 Estilos (tokens claro/oscuro, layout, componentes)
js/config.js                   ← EL ÚNICO ARCHIVO A EDITAR (claves de Supabase)
js/datos.js                    Capa de datos y sesión (local o nube)
js/data.js                     Catálogo inicial de 128 productos
js/app.js                      Lógica de la aplicación
js/vendor/supabase-2.117.3.js  Librería de Supabase incluida en el repo
supabase/schema.sql            Script que crea las tablas y la seguridad
.nojekyll                      Evita que GitHub Pages procese el sitio con Jekyll
```

La librería de Supabase va **incluida en el repositorio** en vez de cargarse de
un CDN, para que la app funcione aunque la red de la oficina bloquee CDNs.

---

## 5. Funcionalidades

### Dashboard
- Total de productos y unidades en stock.
- Productos con stock bajo (`stock <= stock mínimo`), separando los que están en 0.
- Valor del inventario en AR$ y en USD.
- Gráfico de distribución por familia o por sistema/rubro, con tres métricas
  (productos, valor en AR$, unidades) y una vista de tabla con los valores exactos.
- Alertas de stock y, con sincronización activa, el **historial de movimientos**
  con autor, motivo y fecha.

### Productos
Alta, modificación y baja con validación campo por campo:

| Campo | Regla |
|---|---|
| Familia | OC, CC, CO o AWC |
| Código de artículo | Obligatorio y **único** (sin distinguir mayúsculas ni tildes) |
| Descripción | Obligatoria, hasta 160 caracteres |
| Sistema / Rubro | Uno de los 14 rubros |
| Presentación | Entero ≥ 1 (unidades por caja) |
| Precio USD por caja | Número ≥ 0 |
| Precio AR$ por caja | **Calculado**: `USD × tipo de cambio` |
| Precio AR$ por unidad | **Calculado**: `precio por caja ÷ presentación` |
| Stock actual | Entero ≥ 0, **en unidades** |
| Stock mínimo | Entero ≥ 0, **en unidades** |
| Observaciones | Opcional, hasta 500 caracteres |

La baja **siempre pide confirmación** y avisa si el producto tiene stock cargado.

La tabla tiene búsqueda global (ignora tildes y acepta varios términos), filtros
por familia, rubro y estado de stock, ordenamiento por cualquier columna
—incluidas las calculadas— y paginación de 20.

### Exportaciones

| Export | Archivo | Contenido |
|---|---|---|
| Tango Gestión | `IAC_tango_AAAA-MM-DD.csv` | `COD_ARTICU`, `DESCRIPCIO`, `PRECIO_VTA` (AR$ por unidad), `UNIDAD_MEDIDA`, `RUBRO` |
| Excel | `IAC_stock_AAAA-MM-DD.xlsx` | Hoja *Productos* (stock en unidades, equivalencia en cajas, valorización) + hoja *Resumen* |
| Backup JSON | `IAC_backup_AAAA-MM-DD.json` | Productos y configuración completos |
| Importar JSON | — | Restaura un backup, con confirmación previa |

El CSV se genera con **BOM UTF-8** y fin de línea CRLF para que Excel y Tango
respeten los acentos. Los decimales usan punto; el separador de columnas es
configurable (por defecto `;`).

### Configuración
- **Tipo de cambio**: al guardarlo, **todos los precios en AR$ se recalculan**
  en la tabla, el dashboard, el formulario y las tres exportaciones.
- Stock mínimo por defecto, unidad de medida y separador del CSV para Tango.
- Restablecer el catálogo inicial.

---

## 6. Decisiones que conviene conocer

**Los precios en AR$ no se almacenan: se calculan.** Sólo se guarda el precio en
USD y la presentación. Así es imposible que queden precios viejos cuando cambia
el tipo de cambio. Como efecto, con el tipo de cambio en 1500 los montos
difieren en centavos de la lista original, que se había calculado con ~1499,85.

**El catálogo arranca con 0 unidades.** La lista original no traía existencias, e
inventarlas habría significado cargar datos falsos. Hay que cargar las
cantidades reales con *Carga rápida*.

**Si venías de la versión anterior**, que contaba el stock en cajas, esos datos
se descartan al abrir la app nueva y se avisa en pantalla. Reinterpretar los
números sin saber cuáles eran cajas y cuáles unidades habría sido inventar
inventario.

**Sin conexión no se puede escribir.** Con sincronización activa, la nube es la
fuente de verdad: si se corta internet, la app avisa del error y no da por
guardado un cambio que no llegó. El navegador mantiene una copia local, pero
sólo como respaldo de lectura.

**Cerrar sesión borra la copia local** del dispositivo, para no dejar datos de
la empresa en una máquina de la que alguien se acaba de desconectar.

---

## 7. Dependencias externas

| Librería | Uso | Si no carga |
|---|---|---|
| Supabase JS 2.117.3 | Sincronización y login | Incluida en el repo; si fallara, la app sigue en modo local |
| Font Awesome 6.5.2 (CDN) | Íconos | La app funciona igual, sin íconos |
| SheetJS 0.18.5 (CDN) | Exportación a `.xlsx` | Se avisa y quedan disponibles el CSV y el JSON |
| Inter (Google Fonts) | Tipografía | Se usa la tipografía del sistema |

---

## 8. Compatibilidad

Navegadores modernos de escritorio y móvil. Usa `<dialog>`, `ResizeObserver` e
`Intl`. En pantallas chicas la barra lateral se convierte en menú hamburguesa.
El tema claro/oscuro sigue la preferencia del sistema hasta que se usa el botón
del encabezado.
