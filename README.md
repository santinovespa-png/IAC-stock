# IAC INTERNACIONAL SRL — Sistema de Gestión de Stock

Aplicación web de gestión de stock para **IAC INTERNACIONAL SRL**. Es una SPA
100 % estática (HTML + CSS + JavaScript vanilla), pensada para publicarse en
GitHub Pages: **no hay backend, ni base de datos, ni servidor**.

Todos los datos viven en el `localStorage` del navegador y se pueden respaldar y
restaurar con archivos JSON.

---

## Publicar en GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En *Build and deployment*, elegir **Deploy from a branch**.
3. Branch: la rama donde esté este código (por ejemplo `main`), carpeta `/ (root)`.
4. Guardar. En uno o dos minutos la app queda disponible en
   `https://<usuario>.github.io/<repositorio>/`.

No hace falta compilar nada: `index.html` está en la raíz y referencia `css/` y `js/`
con rutas relativas.

Para probarla localmente alcanza con abrir `index.html` en el navegador, o levantar
un servidor estático:

```bash
python3 -m http.server 8080
# luego abrir http://localhost:8080
```

---

## Estructura

```
index.html        Única página: vistas, modales y contenedor de notificaciones
css/styles.css    Hoja de estilos (tokens de diseño, layout, componentes, responsive)
js/data.js        Catálogo inicial de 128 productos + familias y rubros
js/app.js         Toda la lógica: estado, persistencia, vistas, ABM, exportaciones
.nojekyll         Evita que GitHub Pages procese el sitio con Jekyll
```

---

## Funcionalidades

### Dashboard
- Total de productos y cajas en stock.
- Productos con stock bajo (`stock <= stock mínimo`), separando los que están en 0.
- Valor del inventario en AR$ y en USD.
- Gráfico de distribución, con tres métricas (cantidad de productos, valor en AR$
  y cajas) agrupables **por familia** o **por sistema / rubro**, más una vista de
  tabla con los valores exactos.
- Listado de las alertas de stock más urgentes, con acceso directo al ajuste.

### Productos (ABM)
Alta, modificación y baja con validación completa de todos los campos:

| Campo | Regla |
|---|---|
| Familia | OC, CC, CO o AWC |
| Código de artículo | Obligatorio y **único** (se compara sin distinguir mayúsculas ni tildes) |
| Descripción | Obligatoria, hasta 160 caracteres |
| Sistema / Rubro | Uno de los 14 rubros del catálogo |
| Presentación | Entero ≥ 1 (unidades por caja) |
| Precio USD por caja | Número ≥ 0 |
| Precio AR$ por caja | **Calculado**: `USD × tipo de cambio` |
| Precio AR$ por unidad | **Calculado**: `precio por caja ÷ presentación` |
| Stock actual | Entero ≥ 0 (en cajas) |
| Stock mínimo | Entero ≥ 0, por defecto 5 |
| Observaciones | Opcional, hasta 500 caracteres |

La baja **siempre pide confirmación** y avisa si el producto tiene stock cargado.

### Tabla de productos
- Búsqueda global por código, descripción, familia (sigla o nombre) y rubro.
  Ignora tildes y mayúsculas, y acepta varios términos.
- Filtros por familia, por sistema / rubro y por estado de stock.
- Ordenamiento por cualquier columna, incluidas las calculadas (AR$ por caja y
  por unidad). También funciona con teclado.
- Paginación de 20 productos por página.
- Indicador rojo en la fila y badge con ícono y texto cuando `stock <= stock mínimo`.

### Ajuste de stock
Cada producto tiene un botón de ajuste rápido que permite **sumar o restar cajas**,
con atajos de cantidad, un motivo opcional y una vista previa del resultado antes
de confirmar. No se puede dejar el stock en negativo. Cada movimiento registra la
**fecha y hora**, que se muestran en la columna *Últ. mov.*

### Exportaciones

| Export | Archivo | Contenido |
|---|---|---|
| Tango Gestión | `IAC_tango_AAAA-MM-DD.csv` | `COD_ARTICU`, `DESCRIPCIO`, `PRECIO_VTA` (AR$ por unidad), `UNIDAD_MEDIDA`, `RUBRO` |
| Excel | `IAC_stock_AAAA-MM-DD.xlsx` | Hoja *Productos* (todos los campos, precios y valorización) + hoja *Resumen* |
| Backup JSON | `IAC_backup_AAAA-MM-DD.json` | Productos y configuración completos |
| Importar JSON | — | Restaura un backup, con confirmación previa |

El CSV se genera con **BOM UTF-8** y fin de línea CRLF para que Excel y Tango
respeten los acentos. Los decimales usan punto; el separador de columnas es
configurable (por defecto `;`, que es lo que espera Excel en español).

La importación valida el archivo, descarta registros sin código o sin descripción,
ignora códigos repetidos y muestra un resumen antes de reemplazar nada.

### Configuración
- **Tipo de cambio** (AR$ por USD). Al guardarlo, **todos los precios en AR$ se
  recalculan**: el de la tabla, el del dashboard, el del formulario y el de las
  exportaciones.
- Stock mínimo por defecto para los productos nuevos.
- Unidad de medida y separador de columnas para el CSV de Tango.
- Restablecer el catálogo inicial de 128 productos.

---

## Decisiones de diseño que conviene conocer

**Los precios en AR$ no se almacenan.** En el `localStorage` se guarda sólo el
precio en USD y la presentación. Los dos precios en AR$ se calculan en el momento
a partir del tipo de cambio vigente. Así es imposible que queden precios viejos
dando vueltas cuando el tipo de cambio cambia.

Como consecuencia, con el tipo de cambio en 1500 los valores en AR$ difieren en
centavos de los de la lista original, que había sido calculada con un tipo de
cambio de ~1499,85. Por ejemplo, el artículo `125371` pasa de `38.381,11` a
`38.385,00` (25,59 × 1500). Los precios en USD, que son el dato de origen, no
cambiaron.

**El catálogo inicial viene con stock en 0** y stock mínimo 5. La lista provista
no incluía cantidades, y inventar existencias habría significado cargar datos
falsos en el sistema. Por eso, en el primer uso los 128 productos aparecen como
"sin stock" y el valor del inventario es 0: hay que cargar las existencias reales
con el botón de ajuste de cada producto o editándolo.

**Los datos viven en el navegador.** Si se borran los datos de navegación, se usa
otra computadora u otro navegador, el catálogo no viaja. Conviene **descargar un
backup JSON con regularidad** desde la sección Exportar.

---

## Dependencias externas

Se cargan desde CDN y la aplicación funciona aunque alguna falle:

| Librería | Uso | Si no carga |
|---|---|---|
| Font Awesome 6.5.2 | Íconos | La app funciona igual, sin íconos |
| SheetJS (xlsx) 0.18.5 | Exportación a `.xlsx` | Se avisa con una notificación y quedan disponibles el CSV y el JSON |
| Inter (Google Fonts) | Tipografía | Se usa la tipografía del sistema |

---

## Compatibilidad

Navegadores modernos de escritorio y móvil (Chrome, Edge, Firefox, Safari).
Usa `<dialog>`, `ResizeObserver` e `Intl`, con degradación prevista donde
corresponde. La interfaz es responsive: en pantallas chicas la barra lateral se
convierte en un menú hamburguesa.

El tema claro / oscuro sigue la preferencia del sistema operativo hasta que se
usa el botón del encabezado; a partir de ahí se respeta la elección manual, que
queda guardada.
