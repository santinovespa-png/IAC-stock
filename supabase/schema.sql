-- ============================================================================
--  IAC INTERNACIONAL SRL — Sistema de Gestión de Stock
--  Esquema de la base de datos en Supabase.
--
--  CÓMO USARLO
--  1. Entrá a tu proyecto en https://supabase.com
--  2. Menú lateral → SQL Editor → New query
--  3. Pegá TODO este archivo y apretá "Run"
--
--  Se puede ejecutar más de una vez sin romper nada: todo está escrito de
--  forma idempotente.
--
--  IMPORTANTE: el stock se guarda SIEMPRE EN UNIDADES, no en cajas.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. TABLA DE PRODUCTOS
-- ----------------------------------------------------------------------------
create table if not exists public.productos (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text        not null,
  descripcion               text        not null,
  familia                   text        not null default 'OC',
  sistema                   text        not null default '1 pieza',
  presentacion_caja         integer     not null default 1  check (presentacion_caja >= 1),
  precio_usd                numeric(12,2) not null default 0 check (precio_usd >= 0),
  -- Stock y mínimo EN UNIDADES
  stock                     integer     not null default 0  check (stock >= 0),
  stock_minimo              integer     not null default 5  check (stock_minimo >= 0),
  lote                      text        not null default '',
  observaciones             text        not null default '',
  ultimo_movimiento         timestamptz,
  ultimo_movimiento_detalle text,
  actualizado_por           text,
  creado_en                 timestamptz not null default now(),
  actualizado_en            timestamptz not null default now()
);

-- El código de artículo es único en todo el catálogo, sin distinguir
-- mayúsculas de minúsculas ni espacios al borde.
create unique index if not exists productos_codigo_unico
  on public.productos (lower(btrim(codigo)));


-- ----------------------------------------------------------------------------
-- 2. CONFIGURACIÓN (una sola fila, id = 1)
-- ----------------------------------------------------------------------------
create table if not exists public.config (
  id                   integer primary key default 1 check (id = 1),
  tipo_cambio          numeric(12,4) not null default 1500 check (tipo_cambio > 0),
  stock_minimo_default integer     not null default 5 check (stock_minimo_default >= 0),
  unidad_medida        text        not null default 'UNIDAD',
  csv_delimitador      text        not null default ';',
  actualizado_en       timestamptz not null default now()
);

insert into public.config (id) values (1) on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 3. MOVIMIENTOS DE STOCK (historial: quién tocó qué y cuándo)
-- ----------------------------------------------------------------------------
create table if not exists public.movimientos (
  id               bigserial primary key,
  producto_id      uuid references public.productos(id) on delete set null,
  codigo           text    not null,
  descripcion      text,
  delta            integer not null,          -- en unidades; negativo = salida
  stock_resultante integer not null,
  lote             text,                      -- lote involucrado en el movimiento
  motivo           text,
  usuario          text,
  creado_en        timestamptz not null default now()
);

create index if not exists movimientos_fecha on public.movimientos (creado_en desc);
create index if not exists movimientos_producto on public.movimientos (producto_id);


-- ----------------------------------------------------------------------------
-- 3b. ACTUALIZACIONES SOBRE BASES YA CREADAS
--
--     Si ya habías ejecutado una versión anterior de este archivo, estas
--     líneas agregan lo que falta sin tocar los datos que tengas cargados.
--     Volver a ejecutar todo el archivo es seguro.
-- ----------------------------------------------------------------------------
alter table public.productos
  add column if not exists lote text not null default '';

alter table public.movimientos
  add column if not exists lote text;


-- ----------------------------------------------------------------------------
-- 4. SELLO AUTOMÁTICO DE actualizado_en
-- ----------------------------------------------------------------------------
create or replace function public.touch_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists productos_touch on public.productos;
create trigger productos_touch
  before update on public.productos
  for each row execute function public.touch_actualizado();

drop trigger if exists config_touch on public.config;
create trigger config_touch
  before update on public.config
  for each row execute function public.touch_actualizado();


-- ----------------------------------------------------------------------------
-- 5. SEGURIDAD: sólo usuarios con sesión iniciada
--
--    Sin esto, cualquiera con la URL del proyecto podría leer y modificar el
--    stock. Con RLS activo y estas políticas, hace falta haber iniciado sesión.
--    Los usuarios se crean a mano desde el panel de Supabase
--    (Authentication → Users → Add user). No hay registro público.
-- ----------------------------------------------------------------------------
alter table public.productos   enable row level security;
alter table public.config      enable row level security;
alter table public.movimientos enable row level security;

drop policy if exists productos_auth   on public.productos;
drop policy if exists config_auth      on public.config;
drop policy if exists movimientos_leer on public.movimientos;
drop policy if exists movimientos_alta on public.movimientos;

create policy productos_auth on public.productos
  for all to authenticated
  using (true) with check (true);

create policy config_auth on public.config
  for all to authenticated
  using (true) with check (true);

-- El historial se lee y se agrega, pero no se edita ni se borra.
create policy movimientos_leer on public.movimientos
  for select to authenticated using (true);

create policy movimientos_alta on public.movimientos
  for insert to authenticated with check (true);


-- ----------------------------------------------------------------------------
-- 6. TIEMPO REAL
--    Hace que un cambio hecho en el celular aparezca solo en las demás
--    pantallas, sin recargar.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.productos;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.config;
  exception when duplicate_object then null;
  end;
end;
$$;


-- ----------------------------------------------------------------------------
-- 7. VERIFICACIÓN
--    Al terminar deberías ver las tres tablas con RLS en true.
-- ----------------------------------------------------------------------------
select
  c.relname  as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = c.relname
      and column_name = 'lote') = 1 as tiene_columna_lote
from pg_class c
where c.relname in ('productos', 'config', 'movimientos')
  and c.relnamespace = 'public'::regnamespace
order by c.relname;
