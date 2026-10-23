/**
 * data.js — Catálogo inicial de productos de IAC INTERNACIONAL SRL.
 *
 * Se carga UNA SOLA VEZ, en el primer uso de la aplicación, para sembrar el
 * localStorage. A partir de ahí, la fuente de verdad es el localStorage y este
 * archivo sólo se vuelve a usar si el usuario restablece los datos de fábrica
 * desde la pantalla de Configuración.
 *
 * Importante sobre los precios:
 * aquí sólo se guarda el precio en USD por caja y la presentación (unidades por
 * caja). Los precios en AR$ (por caja y por unidad) NO se almacenan: se calculan
 * siempre en el momento a partir del tipo de cambio vigente, de modo que al
 * cambiar el tipo de cambio todos los precios en AR$ quedan actualizados.
 *
 *   precio AR$ caja   = precio_usd x tipo_cambio
 *   precio AR$ unidad = precio AR$ caja / presentacion_caja
 *
 * Total: 128 productos. Tipo de cambio base: 1500.
 */

/** Tipo de cambio por defecto (AR$ por USD). */
const TIPO_CAMBIO_DEFAULT = 1500;

/** Stock minimo por defecto para las alertas de stock bajo. */
const STOCK_MINIMO_DEFAULT = 5;

/** Familias / rubros comerciales. */
const FAMILIAS = [
  { codigo: 'OC', nombre: 'Ostomy Care' },
  { codigo: 'CC', nombre: 'Continence Care' },
  { codigo: 'CO', nombre: 'Continence - Cateterismo' },
  { codigo: 'AWC', nombre: 'Advanced Wound Care' }
];

/** Sistemas / rubros de producto. */
const SISTEMAS = [
  '1 pieza',
  '2 piezas',
  'Accesorios',
  'FlexiSeal',
  'GentleCath',
  'Gel',
  'Alginatos',
  'Hidrocoloides',
  'Hydrofibras',
  'Espumas',
  'NPWT',
  'Vendas',
  'Skin Care',
  'Super Absorbente'
];

/**
 * Catalogo inicial (128 productos).
 * @type {{familia: string, codigo: string, descripcion: string, sistema: string,
 *         presentacion_caja: number, precio_usd: number}[]}
 */
const PRODUCTOS_INICIALES = [
  {
    familia: "OC",
    codigo: "125371",
    descripcion: "Bolsa Drenable Recortable Transp.\"Custom\" 19/64mm (2.5\")",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 25.59
  },
  {
    familia: "OC",
    codigo: "400394",
    descripcion: "Bolsa Dreanable Recortable Transp. Standar 19/64mm",
    sistema: "1 pieza",
    presentacion_caja: 30,
    precio_usd: 66.33
  },
  {
    familia: "OC",
    codigo: "64927",
    descripcion: "Bolsa Urostomia Durahesive Recortable 19/50mm Active Life",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 50.09
  },
  {
    familia: "OC",
    codigo: "20922",
    descripcion: "Bolsa Drenable Recort. Little Ones Active Life 8 a 50mm",
    sistema: "1 pieza",
    presentacion_caja: 15,
    precio_usd: 46.77
  },
  {
    familia: "OC",
    codigo: "21712",
    descripcion: "Placa Stomahesive sin aro 10cm x 10cm",
    sistema: "Accesorios",
    presentacion_caja: 5,
    precio_usd: 32.01
  },
  {
    familia: "OC",
    codigo: "25510",
    descripcion: "Polvo Stomahesive 28,30 grs.",
    sistema: "Accesorios",
    presentacion_caja: 1,
    precio_usd: 14.56
  },
  {
    familia: "OC",
    codigo: "183910",
    descripcion: "Pasta Stomahesive 56,70 grs.",
    sistema: "Accesorios",
    presentacion_caja: 1,
    precio_usd: 12.76
  },
  {
    familia: "OC",
    codigo: "175507",
    descripcion: "Cinturón para equipo de ostomía",
    sistema: "Accesorios",
    presentacion_caja: 1,
    precio_usd: 17.69
  },
  {
    familia: "OC",
    codigo: "175635",
    descripcion: "Cierres de bolsa",
    sistema: "Accesorios",
    presentacion_caja: 10,
    precio_usd: 16.72
  },
  {
    familia: "OC",
    codigo: "420791",
    descripcion: "Diamonds",
    sistema: "Accesorios",
    presentacion_caja: 1,
    precio_usd: 187.8
  },
  {
    familia: "OC",
    codigo: "416417",
    descripcion: "BOLSA NATURA® DRENABLE OPACA Aro 45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "125264",
    descripcion: "BARRERA NATURA® FLEXIBLE 45mm",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 52.65
  },
  {
    familia: "OC",
    codigo: "125265",
    descripcion: "BARRERA NATURA® FLEXIBLE 57mm",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 52.65
  },
  {
    familia: "OC",
    codigo: "416420",
    descripcion: "BOLSA NATURA® DRENABLE OPACA Aro 57",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "411633",
    descripcion: "LITTLE ONES® NEONATAL 0/23mm",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 137.83
  },
  {
    familia: "OC",
    codigo: "125263",
    descripcion: "BARRERA NATURA® FLEXIBLE 38mm",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 52.65
  },
  {
    familia: "OC",
    codigo: "125266",
    descripcion: "BARRERA NATURA® FLEXIBLE 70mm",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 52.65
  },
  {
    familia: "OC",
    codigo: "416415",
    descripcion: "NATURA + Bolsa drenable con filtro, con cierre InvisiClose, Opaca, 38mm",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "416403",
    descripcion: "NATURA+ PCH CLD WF STD TAN 38MM(1X30) US",
    sistema: "2 piezas",
    presentacion_caja: 30,
    precio_usd: 78.31
  },
  {
    familia: "OC",
    codigo: "416406",
    descripcion: "NATURA+ PCH CLD WF STD TAN 45MM(1X30) US",
    sistema: "2 piezas",
    presentacion_caja: 30,
    precio_usd: 78.31
  },
  {
    familia: "OC",
    codigo: "416409",
    descripcion: "NATURA+ PCH CLD WF STD TAN 57MM(1X30) US",
    sistema: "2 piezas",
    presentacion_caja: 30,
    precio_usd: 78.31
  },
  {
    familia: "OC",
    codigo: "416412",
    descripcion: "NATURA+ PCH CLD WF STD TAN 70MM(1X30) US",
    sistema: "2 piezas",
    presentacion_caja: 30,
    precio_usd: 78.31
  },
  {
    familia: "OC",
    codigo: "401544",
    descripcion: "BOLSA NATURA® UROSTOMIA TRANSPARENTE Aro 38",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 58.02
  },
  {
    familia: "OC",
    codigo: "401545",
    descripcion: "BOLSA NATURA® UROSTOMIA TRANSPARENTE Aro 45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 58.02
  },
  {
    familia: "OC",
    codigo: "411642",
    descripcion: "Little Ones® Two-Piece Adhesive Coupling Technology Standard Flexible- Barrera",
    sistema: "2 piezas",
    presentacion_caja: 5,
    precio_usd: 63.82
  },
  {
    familia: "OC",
    codigo: "411637",
    descripcion: "SYN INVISI PAED STDCLRPTDBSFWF31MM1X10US- Bolsa",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 99.88
  },
  {
    familia: "CC",
    codigo: "418000",
    descripcion: "FLEXI SEAL Sist. Incont. Fecal",
    sistema: "FlexiSeal",
    presentacion_caja: 1,
    precio_usd: 402.53
  },
  {
    familia: "CC",
    codigo: "411108",
    descripcion: "FLEXI SEAL Bolsas Colectoras",
    sistema: "FlexiSeal",
    presentacion_caja: 10,
    precio_usd: 153.44
  },
  {
    familia: "CO",
    codigo: "421564",
    descripcion: "GENTLECATH GLIDE MALE CH08(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421565",
    descripcion: "GENTLECATH GLIDE MALE CH10(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421566",
    descripcion: "GENTLECATH GLIDE MALE CH12(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421567",
    descripcion: "GENTLECATH GLIDE MALE CH14(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421568",
    descripcion: "GENTLECATH GLIDE MALE CH16(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421570",
    descripcion: "GENTLECATH GLIDE FEM CH08(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421571",
    descripcion: "GENTLECATH GLIDE FEM CH10(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421572",
    descripcion: "GENTLECATH GLIDE FEM CH12(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421573",
    descripcion: "GENTLECATH GLIDE FEM CH14(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421909",
    descripcion: "GENTLECATH GLIDE TMNN CH12(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421910",
    descripcion: "GENTLECATH GLIDE TMNN CH14(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "CO",
    codigo: "421911",
    descripcion: "GENTLECATH GLIDE TMNN CH16(1x30PK) EUR",
    sistema: "GentleCath",
    presentacion_caja: 30,
    precio_usd: 98.18
  },
  {
    familia: "AWC",
    codigo: "145730",
    descripcion: "SAF GEL TUBO 85 G",
    sistema: "Gel",
    presentacion_caja: 1,
    precio_usd: 10.26
  },
  {
    familia: "AWC",
    codigo: "168117",
    descripcion: "KALTOSTAT 2X45CM",
    sistema: "Alginatos",
    presentacion_caja: 5,
    precio_usd: 60.4
  },
  {
    familia: "AWC",
    codigo: "168212",
    descripcion: "KALTOSTAT 7,5X12 CM",
    sistema: "Alginatos",
    presentacion_caja: 10,
    precio_usd: 50.68
  },
  {
    familia: "AWC",
    codigo: "168214",
    descripcion: "KALTOSTAT 10X20 CM",
    sistema: "Alginatos",
    presentacion_caja: 10,
    precio_usd: 92.94
  },
  {
    familia: "AWC",
    codigo: "168215",
    descripcion: "KALTOSTAT 15X25 CM",
    sistema: "Alginatos",
    presentacion_caja: 10,
    precio_usd: 141.27
  },
  {
    familia: "AWC",
    codigo: "187643",
    descripcion: "DUODERM CGF 15X20 CM",
    sistema: "Hidrocoloides",
    presentacion_caja: 5,
    precio_usd: 69.41
  },
  {
    familia: "AWC",
    codigo: "187644",
    descripcion: "DUODERM CGF DRS 20X30CM (1X5PK) US",
    sistema: "Hidrocoloides",
    presentacion_caja: 5,
    precio_usd: 146.39
  },
  {
    familia: "AWC",
    codigo: "187660",
    descripcion: "DUODERM CGF 10X10 CM",
    sistema: "Hidrocoloides",
    presentacion_caja: 5,
    precio_usd: 22.72
  },
  {
    familia: "AWC",
    codigo: "187661",
    descripcion: "DUODERM CGF DRS 15X15CM (1X5PK) NAI",
    sistema: "Hidrocoloides",
    presentacion_caja: 5,
    precio_usd: 39.0
  },
  {
    familia: "AWC",
    codigo: "187662",
    descripcion: "DUODERM CGF 20X20 CM",
    sistema: "Hidrocoloides",
    presentacion_caja: 5,
    precio_usd: 78.55
  },
  {
    familia: "AWC",
    codigo: "187955",
    descripcion: "DUODERM EXTRA FINO 10X10 CM",
    sistema: "Hidrocoloides",
    presentacion_caja: 10,
    precio_usd: 35.17
  },
  {
    familia: "AWC",
    codigo: "187957",
    descripcion: "DUODERM EXTRA FINO 15X15 CM QUADR",
    sistema: "Hidrocoloides",
    presentacion_caja: 10,
    precio_usd: 61.53
  },
  {
    familia: "AWC",
    codigo: "187987",
    descripcion: "DUODERM GEL 30 GR",
    sistema: "Gel",
    presentacion_caja: 3,
    precio_usd: 41.88
  },
  {
    familia: "AWC",
    codigo: "187990",
    descripcion: "DUODERM GEL 15 GR",
    sistema: "Gel",
    presentacion_caja: 10,
    precio_usd: 100.6
  },
  {
    familia: "AWC",
    codigo: "412009",
    descripcion: "AQUACEL AG SURG HIDROF CIR 9X10CM",
    sistema: "Hydrofibras",
    presentacion_caja: 10,
    precio_usd: 517.64
  },
  {
    familia: "AWC",
    codigo: "412010",
    descripcion: "AQUACEL AG SURG HIDROF CIR 9X15CM",
    sistema: "Hydrofibras",
    presentacion_caja: 10,
    precio_usd: 569.39
  },
  {
    familia: "AWC",
    codigo: "412011",
    descripcion: "AQUACEL AG SURG HIDROF CIR 9X25CM",
    sistema: "Hydrofibras",
    presentacion_caja: 10,
    precio_usd: 575.15
  },
  {
    familia: "AWC",
    codigo: "412012",
    descripcion: "AQUACEL AG SURG HIDROF CIR 9X35CM",
    sistema: "Hydrofibras",
    presentacion_caja: 10,
    precio_usd: 695.95
  },
  {
    familia: "AWC",
    codigo: "413567",
    descripcion: "AQUACEL AG+ EXTRA10X10CM(1X10PK)STER EUR",
    sistema: "Hydrofibras",
    presentacion_caja: 10,
    precio_usd: 242.62
  },
  {
    familia: "AWC",
    codigo: "413568",
    descripcion: "AQUACEL AG+ EXTRA 15X15CM(1X5PK)STER EUR",
    sistema: "Hydrofibras",
    presentacion_caja: 5,
    precio_usd: 263.79
  },
  {
    familia: "AWC",
    codigo: "413571",
    descripcion: "AQUACEL AG+ WSF 2X45CM (1X5PK)STER EUR",
    sistema: "Hydrofibras",
    presentacion_caja: 5,
    precio_usd: 74.95
  },
  {
    familia: "AWC",
    codigo: "413569",
    descripcion: "AQUACEL AG+ EXTRA 20X30CM(1X5PK)STER EUR",
    sistema: "Hydrofibras",
    presentacion_caja: 5,
    precio_usd: 700.86
  },
  {
    familia: "AWC",
    codigo: "420672",
    descripcion: "AQUACEL EXTRA 10CMX10CM",
    sistema: "Hydrofibras",
    presentacion_caja: 10,
    precio_usd: 199.05
  },
  {
    familia: "AWC",
    codigo: "420673",
    descripcion: "AQUACEL EXTRA 15CMX15CM",
    sistema: "Hydrofibras",
    presentacion_caja: 5,
    precio_usd: 116.07
  },
  {
    familia: "AWC",
    codigo: "420633",
    descripcion: "AQUACEL FOAM 10CMX10CM NÃO ADESIVO",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 155.38
  },
  {
    familia: "AWC",
    codigo: "420635",
    descripcion: "AQUACEL FOAM 15CMX15CM NÃO ADESIVO",
    sistema: "Espumas",
    presentacion_caja: 5,
    precio_usd: 124.31
  },
  {
    familia: "AWC",
    codigo: "420642",
    descripcion: "AQUACEL AG FOAM 10X10 CM NAO ADESIVO",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 186.45
  },
  {
    familia: "AWC",
    codigo: "420680",
    descripcion: "AQUACEL FOAM 10CMX10CM ADESIVO",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 154.92
  },
  {
    familia: "AWC",
    codigo: "420619",
    descripcion: "AQUACEL FOAM® ADHESIVO 12,5x12,5cm",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 196.28
  },
  {
    familia: "AWC",
    codigo: "650941",
    descripcion: "FLEXIDRESS B. UNNA 10,16CMX9,14M",
    sistema: "Vendas",
    presentacion_caja: 1,
    precio_usd: 22.76
  },
  {
    familia: "OC",
    codigo: "416700",
    descripcion: "ESTEEM+ PCH CLDSTDCLRWF60/70MM(1X30) US",
    sistema: "1 pieza",
    presentacion_caja: 30,
    precio_usd: 52.54
  },
  {
    familia: "OC",
    codigo: "416701",
    descripcion: "ESTEEM+ PCH CLD WFSTDTAN60/70MM(1X30) US",
    sistema: "1 pieza",
    presentacion_caja: 30,
    precio_usd: 52.54
  },
  {
    familia: "OC",
    codigo: "20917",
    descripcion: "AC LIFE LO BOL URO TR INF 8/25MM",
    sistema: "1 pieza",
    presentacion_caja: 15,
    precio_usd: 116.68
  },
  {
    familia: "AWC",
    codigo: "422285",
    descripcion: "AVELLE® BOMBA NO ESTÉRIL + 6 PILAS (EST)",
    sistema: "NPWT",
    presentacion_caja: 1,
    precio_usd: 775.49
  },
  {
    familia: "AWC",
    codigo: "421552",
    descripcion: "AVELLE® 16 cm X 16 cm –ALMOHADILLA 8 cm X 8 cm (EST)",
    sistema: "NPWT",
    presentacion_caja: 5,
    precio_usd: 704.99
  },
  {
    familia: "AWC",
    codigo: "421553",
    descripcion: "AVELLE® 16 cm X 21 cm –ALMOHADILLA 8 cm X 13 cm (EST)",
    sistema: "NPWT",
    presentacion_caja: 5,
    precio_usd: 704.99
  },
  {
    familia: "AWC",
    codigo: "421554",
    descripcion: "AVELLE® 12 cm X 21 cm –ALMOHADILLA 4 cm X 13 cm (EST)",
    sistema: "NPWT",
    presentacion_caja: 5,
    precio_usd: 704.99
  },
  {
    familia: "AWC",
    codigo: "421555",
    descripcion: "AVELLE® 12 cm X 31 cm –ALMOHADILLA 4 cm X 23 cm (EST)",
    sistema: "NPWT",
    presentacion_caja: 5,
    precio_usd: 704.99
  },
  {
    familia: "AWC",
    codigo: "422155",
    descripcion: "AVELLE® 12 cm X 41 cm –ALMOHADILLA 4 cm X 33 cm (EST)",
    sistema: "NPWT",
    presentacion_caja: 5,
    precio_usd: 803.68
  },
  {
    familia: "AWC",
    codigo: "422157",
    descripcion: "AVELLE® 26 cm X 26 cm –ALMOHADILLA 4 cm X 33 cm (EST)",
    sistema: "NPWT",
    presentacion_caja: 5,
    precio_usd: 1234.59
  },
  {
    familia: "OC",
    codigo: "423281",
    descripcion: "ESENTA ADHESIVE REMOVER WIPE (1X30PK)INT",
    sistema: "Accesorios",
    presentacion_caja: 30,
    precio_usd: 85.94
  },
  {
    familia: "OC",
    codigo: "423282",
    descripcion: "ESENTA SKIN BARRIER WIPE (1X30PK) INT",
    sistema: "Accesorios",
    presentacion_caja: 30,
    precio_usd: 85.94
  },
  {
    familia: "OC",
    codigo: "423288",
    descripcion: "ESENTA PELICULA BARRERA SPRAY 50 ML",
    sistema: "Accesorios",
    presentacion_caja: 1,
    precio_usd: 33.99
  },
  {
    familia: "OC",
    codigo: "423289",
    descripcion: "ESENTA ELIMINADOR ADHESIVO SPRAY 50 ML",
    sistema: "Accesorios",
    presentacion_caja: 1,
    precio_usd: 33.99
  },
  {
    familia: "OC",
    codigo: "416976",
    descripcion: "Esteem+ Durahesive Plus with Filter, InvisiClose, Transparent, 19-64mm",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 47.19
  },
  {
    familia: "OC",
    codigo: "416975",
    descripcion: "Esteem+ Drainable Pouch with Filter, InvisiClose, Opaque, 19-64mm",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 47.19
  },
  {
    familia: "AWC",
    codigo: "421579",
    descripcion: "AQUACEL FOAM PRO SACRAL20X16.9CM 1X5 NAI",
    sistema: "Espumas",
    presentacion_caja: 5,
    precio_usd: 100.8
  },
  {
    familia: "AWC",
    codigo: "422356",
    descripcion: "AQUACEL FOAMPRO HEEL19.8X14CM 1X10PK NAI",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 339.23
  },
  {
    familia: "AWC",
    codigo: "422357",
    descripcion: "AQUACEL FOAM PRO 10X10CM 1X10PK NAI",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 54.28
  },
  {
    familia: "AWC",
    codigo: "421559",
    descripcion: "CONVATEC FOAM LITE 10X10CM 1X10 STER US",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 67.85
  },
  {
    familia: "AWC",
    codigo: "421563",
    descripcion: "CONVATEC FOAM LITE 5.5X12CM 1X10 STER US",
    sistema: "Espumas",
    presentacion_caja: 10,
    precio_usd: 53.3
  },
  {
    familia: "AWC",
    codigo: "423286",
    descripcion: "ESENTA BARRIER PUMP SPRAY 28 ML",
    sistema: "Skin Care",
    presentacion_caja: 1,
    precio_usd: 15.5
  },
  {
    familia: "OC",
    codigo: "416414",
    descripcion: "BOLSA NATURA® DRENABLE TRANSPARENTE Aro 38",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "416416",
    descripcion: "BOLSA NATURA® DRENABLE TRANSPARENTE Aro 45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "416419",
    descripcion: "BOLSA NATURA® DRENABLE TRANSPARENTE Aro 57",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "416422",
    descripcion: "BOLSA NATURA® DRENABLE TRANSPARENTE Aro 70",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "413522",
    descripcion: "ESTEEM+MLD DRNINVISIWFTAN30/40MM1X10NAI",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 79.14
  },
  {
    familia: "OC",
    codigo: "416908",
    descripcion: "ESTEEM+ PCHDRNW/INVISISTDCLR100MM1X10 US",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 104.13
  },
  {
    familia: "OC",
    codigo: "422159",
    descripcion: "EST+ FLEX CVX V0 CTF DRN 20-57 1X10 NAI",
    sistema: "1 pieza",
    presentacion_caja: 10,
    precio_usd: 71.41
  },
  {
    familia: "OC",
    codigo: "401543",
    descripcion: "Bolsa Natura Urostomia Transparente Aro 38",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 58.02
  },
  {
    familia: "OC",
    codigo: "413154",
    descripcion: "Barrera Natura Rígida 38MM",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 61.05
  },
  {
    familia: "OC",
    codigo: "413155",
    descripcion: "SURFIT NAT S4S D/HESIVE WFR 45MM(1X10)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 61.05
  },
  {
    familia: "OC",
    codigo: "413156",
    descripcion: "SURFIT NAT S4S D/HESIVE WFR 57MM(1X10)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 61.05
  },
  {
    familia: "OC",
    codigo: "416423",
    descripcion: "Bolsa Natura Drenable Opaca Aro 70",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 103.38
  },
  {
    familia: "OC",
    codigo: "413157",
    descripcion: "SURFIT NAT S4S D/HESIVE WFR 70MM(1X10)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 61.05
  },
  {
    familia: "OC",
    codigo: "401905",
    descripcion: "SURFIT NAT S4S D/HESIVE WFR100MM(1X5) US",
    sistema: "2 piezas",
    presentacion_caja: 5,
    precio_usd: 61.05
  },
  {
    familia: "OC",
    codigo: "401515",
    descripcion: "NATURA PCH DRN STD CLR 100MM (1X10) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 203.54
  },
  {
    familia: "OC",
    codigo: "413180",
    descripcion: "Barrera Natura Convexa Precortada 22MM /A45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 143.41
  },
  {
    familia: "OC",
    codigo: "413181",
    descripcion: "Barrera Natura Convexa Precortada 25MM /A45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 143.41
  },
  {
    familia: "OC",
    codigo: "413182",
    descripcion: "Barrera Natura Convexa Precortada 28MM /A45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 143.41
  },
  {
    familia: "OC",
    codigo: "413183",
    descripcion: "Barrera Natura Convexa Precortada 32MM /A45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 143.41
  },
  {
    familia: "OC",
    codigo: "413184",
    descripcion: "Barrera Natura Convexa Precortada 35MM /A45",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 56.53
  },
  {
    familia: "OC",
    codigo: "413185",
    descripcion: "SURFIT NATURA WFR CVX 38/57MM (1X10PK)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 56.53
  },
  {
    familia: "OC",
    codigo: "413186",
    descripcion: "SURFIT NATURA WFR CVX 41/57MM (1X10PK)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 56.53
  },
  {
    familia: "OC",
    codigo: "401925",
    descripcion: "SURFIT NATURA L/ONE WFR 32MM (1X5PK) US",
    sistema: "2 piezas",
    presentacion_caja: 5,
    precio_usd: 29.75
  },
  {
    familia: "OC",
    codigo: "401927",
    descripcion: "NATURA PCH DRN PAED CLR 32MM (1X10) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 66.94
  },
  {
    familia: "OC",
    codigo: "401926",
    descripcion: "SURFIT NATURA L/ONE WFR 45MM (1X5PK) US",
    sistema: "2 piezas",
    presentacion_caja: 5,
    precio_usd: 29.75
  },
  {
    familia: "OC",
    codigo: "401928",
    descripcion: "NATURA PCH DRN PAED CLR 45MM (1X10) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 66.94
  },
  {
    familia: "OC",
    codigo: "411807",
    descripcion: "NATURA STOMA FLATMOLD 45/70MM(1X10PK) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 67.84
  },
  {
    familia: "OC",
    codigo: "411801",
    descripcion: "NATURA STOMA FLATMOLD SM 45MM(1X10PK) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 67.84
  },
  {
    familia: "OC",
    codigo: "411803",
    descripcion: "NATURA STOMA FLATMOLD MED 45MM(1X10PK) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 67.84
  },
  {
    familia: "OC",
    codigo: "411805",
    descripcion: "NATURA STOMA FLATMOLD LRG 57MM(1X10PK) US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 67.84
  },
  {
    familia: "OC",
    codigo: "404592",
    descripcion: "NATURA WFR MOLDABLE CVX 13/45MM (1X10)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 68.97
  },
  {
    familia: "OC",
    codigo: "404593",
    descripcion: "NATURA WFR MOLDABLE CVX 22/45MM (1X10)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 68.97
  },
  {
    familia: "OC",
    codigo: "404594",
    descripcion: "NATURA WFR MOLDABLE CVX 33/57MM (1X10)US",
    sistema: "2 piezas",
    presentacion_caja: 10,
    precio_usd: 68.97
  },
  {
    familia: "AWC",
    codigo: "422567",
    descripcion: "CONVAMAX SUPABS N/ADH 10X10CM 1X10 INT",
    sistema: "Super Absorbente",
    presentacion_caja: 10,
    precio_usd: 35.7
  },
  {
    familia: "AWC",
    codigo: "422570",
    descripcion: "CONVAMAX SUPABS N/ADH 15X15CM 1X10 INT",
    sistema: "Super Absorbente",
    presentacion_caja: 10,
    precio_usd: 59.51
  },
  {
    familia: "AWC",
    codigo: "422572",
    descripcion: "CONVAMAX SUPABS N/ADH 20X20CM 1X10 INT",
    sistema: "Super Absorbente",
    presentacion_caja: 10,
    precio_usd: 110.09
  }
];
