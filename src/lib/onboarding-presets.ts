// Presets para el wizard de onboarding. Detectados por locale del navegador.
// Si no hay match, cae al preset "default" (internacional, USD).

export type Region = "ar" | "mx" | "es" | "us" | "br" | "ve" | "cl" | "co" | "pe" | "default";

export type BillPreset = {
  name: string;
  category: string; // nombre de categoría (se crea/reusa)
  color: string;
  // Sugerencia de día del mes en que vence (1-28). null = sin fecha
  due_day?: number | null;
  // Si es recurrente mensual fijo
  monthly?: boolean;
};

export type RegionPresets = {
  currency: string;
  language: string; // es | en | pt
  bills: BillPreset[];
  platforms: string[]; // para Jornada
};

// Categorías y colores compartidos por todas las regiones
const CAT = {
  vivienda: { name: "Vivienda", color: "#60a5fa" },
  servicios: { name: "Servicios", color: "#34d399" },
  transporte: { name: "Transporte", color: "#fbbf24" },
  personal: { name: "Personal", color: "#a78bfa" },
  suscripciones: { name: "Suscripciones", color: "#f472b6" },
  finanzas: { name: "Finanzas", color: "#f87171" },
};

// Bills compartidos casi por todas las regiones (suscripciones, etc)
const SHARED_SUBS: BillPreset[] = [
  { name: "Netflix",         category: CAT.suscripciones.name, color: CAT.suscripciones.color, monthly: true },
  { name: "Disney+",         category: CAT.suscripciones.name, color: CAT.suscripciones.color, monthly: true },
  { name: "HBO Max",         category: CAT.suscripciones.name, color: CAT.suscripciones.color, monthly: true },
  { name: "Spotify",         category: CAT.suscripciones.name, color: CAT.suscripciones.color, monthly: true },
  { name: "YouTube Premium", category: CAT.suscripciones.name, color: CAT.suscripciones.color, monthly: true },
  { name: "Apple/iCloud",    category: CAT.suscripciones.name, color: CAT.suscripciones.color, monthly: true },
];

const PRESETS: Record<Region, RegionPresets> = {
  ar: {
    currency: "ARS",
    language: "es",
    bills: [
      { name: "Alquiler",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Expensas",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 10 },
      { name: "ABL / impuestos",   category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true },
      { name: "Internet",          category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Luz (Edenor/Edesur)", category: CAT.servicios.name, color: CAT.servicios.color,   monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua",              category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Plan celular",      category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Estacionamiento / cochera", category: CAT.transporte.name, color: CAT.transporte.color, monthly: true },
      { name: "Seguro vehículo",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Patente",           category: CAT.transporte.name,  color: CAT.transporte.color },
      { name: "VTV",               category: CAT.transporte.name,  color: CAT.transporte.color },
      { name: "Prepaga / obra social", category: CAT.personal.name, color: CAT.personal.color,   monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      { name: "Seguro personal",   category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true, due_day: 20 },
    ],
    platforms: ["Mercado Pago", "Uber", "Rappi", "PedidosYa", "Didi", "Cabify"],
  },
  mx: {
    currency: "MXN",
    language: "es",
    bills: [
      { name: "Renta",             category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Predial",           category: CAT.vivienda.name,    color: CAT.vivienda.color },
      { name: "Internet",          category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "CFE (luz)",         category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua",              category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Plan celular (Telcel/AT&T)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "Tenencia / vehículo", category: CAT.transporte.name, color: CAT.transporte.color },
      { name: "Seguro vehículo",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Estacionamiento",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "IMSS / seguro médico", category: CAT.personal.name, color: CAT.personal.color,    monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true },
    ],
    platforms: ["Uber", "Rappi", "DiDi", "Cornershop", "Mercado Libre"],
  },
  es: {
    currency: "EUR",
    language: "es",
    bills: [
      { name: "Alquiler",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Comunidad",         category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true },
      { name: "IBI",               category: CAT.vivienda.name,    color: CAT.vivienda.color },
      { name: "Internet / fibra",  category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Luz",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua",              category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Móvil",             category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Seguro coche",      category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "ITV",               category: CAT.transporte.name,  color: CAT.transporte.color },
      { name: "Parking",           category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Seguro médico",     category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true },
    ],
    platforms: ["Glovo", "Uber", "Bolt", "Cabify", "Just Eat"],
  },
  us: {
    currency: "USD",
    language: "en",
    bills: [
      { name: "Rent",              category: "Housing",    color: CAT.vivienda.color,  monthly: true, due_day: 1 },
      { name: "HOA",               category: "Housing",    color: CAT.vivienda.color,  monthly: true },
      { name: "Property tax",      category: "Housing",    color: CAT.vivienda.color },
      { name: "Internet",          category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Electricity",       category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Gas",               category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Water",             category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Phone plan",        category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Car insurance",     category: "Transport",  color: CAT.transporte.color, monthly: true },
      { name: "Parking",           category: "Transport",  color: CAT.transporte.color, monthly: true },
      { name: "Health insurance",  category: "Personal",   color: CAT.personal.color,  monthly: true },
      { name: "Gym",               category: "Personal",   color: CAT.personal.color,  monthly: true },
      ...SHARED_SUBS.map((b) => ({ ...b, category: "Subscriptions" })),
      { name: "Credit card",       category: "Finance",    color: CAT.finanzas.color,  monthly: true },
    ],
    platforms: ["Uber", "Lyft", "DoorDash", "Instacart", "Grubhub", "Amazon Flex"],
  },
  br: {
    currency: "BRL",
    language: "pt",
    bills: [
      { name: "Aluguel",           category: "Moradia",    color: CAT.vivienda.color,   monthly: true, due_day: 5 },
      { name: "Condomínio",        category: "Moradia",    color: CAT.vivienda.color,   monthly: true },
      { name: "IPTU",              category: "Moradia",    color: CAT.vivienda.color },
      { name: "Internet",          category: "Serviços",   color: CAT.servicios.color,  monthly: true },
      { name: "Luz",               category: "Serviços",   color: CAT.servicios.color,  monthly: true },
      { name: "Gás",               category: "Serviços",   color: CAT.servicios.color,  monthly: true },
      { name: "Água",              category: "Serviços",   color: CAT.servicios.color,  monthly: true },
      { name: "Celular",           category: "Serviços",   color: CAT.servicios.color,  monthly: true },
      { name: "Seguro carro",      category: "Transporte", color: CAT.transporte.color, monthly: true },
      { name: "IPVA",              category: "Transporte", color: CAT.transporte.color },
      { name: "Plano de saúde",    category: "Pessoal",    color: CAT.personal.color,   monthly: true },
      { name: "Academia",          category: "Pessoal",    color: CAT.personal.color,   monthly: true },
      ...SHARED_SUBS.map((b) => ({ ...b, category: "Assinaturas" })),
      { name: "Cartão de crédito", category: "Finanças",   color: CAT.finanzas.color,   monthly: true },
    ],
    platforms: ["iFood", "Uber", "99", "Rappi", "Mercado Livre"],
  },
  ve: {
    // Venezuela usa mucho USD en la calle pero el bolívar (VES) sigue siendo
    // moneda nacional. Dejamos VES por defecto y el usuario puede cambiar a USD
    // en el siguiente paso si trabaja todo en dólar.
    currency: "VES",
    language: "es",
    bills: [
      { name: "Alquiler",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Condominio",        category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true },
      { name: "Internet (CANTV/Inter/NetUno)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "Luz (Corpoelec)",   category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua (Hidrocapital)", category: CAT.servicios.name, color: CAT.servicios.color,   monthly: true },
      { name: "Plan celular (Movistar/Digitel)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "Seguro vehículo",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Estacionamiento",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Seguro HCM",        category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true },
    ],
    platforms: ["Yummy", "Ridery", "Uber", "PedidosYa", "Tucan", "NincaPP"],
  },
  cl: {
    currency: "CLP",
    language: "es",
    bills: [
      { name: "Arriendo",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Gastos comunes",    category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true },
      { name: "Contribuciones",    category: CAT.vivienda.name,    color: CAT.vivienda.color },
      { name: "Internet",          category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Luz (Enel/CGE)",    category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua (Aguas Andinas)", category: CAT.servicios.name, color: CAT.servicios.color,  monthly: true },
      { name: "Plan celular (Entel/Movistar/WOM)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "Permiso de circulación", category: CAT.transporte.name, color: CAT.transporte.color },
      { name: "Seguro vehículo",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Estacionamiento",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Isapre / Fonasa",   category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true },
    ],
    platforms: ["Uber", "Cabify", "DiDi", "inDrive", "Rappi", "PedidosYa", "Cornershop", "Justo", "Uber Eats"],
  },
  co: {
    currency: "COP",
    language: "es",
    bills: [
      { name: "Arriendo",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Administración",    category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true },
      { name: "Predial",           category: CAT.vivienda.name,    color: CAT.vivienda.color },
      { name: "Internet",          category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Luz",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua / acueducto",  category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Plan celular (Claro/Movistar/Tigo)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "Impuesto vehículo", category: CAT.transporte.name,  color: CAT.transporte.color },
      { name: "SOAT",              category: CAT.transporte.name,  color: CAT.transporte.color },
      { name: "Parqueadero",       category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "EPS / Medicina prepagada", category: CAT.personal.name, color: CAT.personal.color, monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true },
    ],
    platforms: ["Uber", "DiDi", "Cabify", "inDrive", "Picap", "Rappi", "iFood", "Mensajeros Urbanos"],
  },
  pe: {
    currency: "PEN",
    language: "es",
    bills: [
      { name: "Alquiler",          category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true, due_day: 5 },
      { name: "Mantenimiento",     category: CAT.vivienda.name,    color: CAT.vivienda.color,    monthly: true },
      { name: "Predial / arbitrios", category: CAT.vivienda.name,  color: CAT.vivienda.color },
      { name: "Internet",          category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Luz (Enel / Luz del Sur)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "Gas",               category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Agua (Sedapal)",    category: CAT.servicios.name,   color: CAT.servicios.color,   monthly: true },
      { name: "Plan celular (Movistar/Claro/Entel/Bitel)", category: CAT.servicios.name, color: CAT.servicios.color, monthly: true },
      { name: "SOAT",              category: CAT.transporte.name,  color: CAT.transporte.color },
      { name: "Seguro vehículo",   category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "Cochera",           category: CAT.transporte.name,  color: CAT.transporte.color,  monthly: true },
      { name: "EPS / seguro salud", category: CAT.personal.name,   color: CAT.personal.color,    monthly: true },
      { name: "Gimnasio",          category: CAT.personal.name,    color: CAT.personal.color,    monthly: true },
      ...SHARED_SUBS,
      { name: "Tarjeta de crédito", category: CAT.finanzas.name,   color: CAT.finanzas.color,    monthly: true },
    ],
    platforms: ["Uber", "Cabify", "DiDi", "inDrive", "Yango", "Rappi", "PedidosYa"],
  },
  default: {
    currency: "USD",
    language: "en",
    bills: [
      { name: "Rent / Housing",    category: "Housing",    color: CAT.vivienda.color,  monthly: true, due_day: 5 },
      { name: "Internet",          category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Electricity",       category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Phone plan",        category: "Utilities",  color: CAT.servicios.color, monthly: true },
      { name: "Health insurance",  category: "Personal",   color: CAT.personal.color,  monthly: true },
      ...SHARED_SUBS.map((b) => ({ ...b, category: "Subscriptions" })),
    ],
    platforms: ["Uber", "Other"],
  },
};

export function detectRegionFromLocale(locale?: string | null): Region {
  if (!locale) return "default";
  const lc = locale.toLowerCase();
  if (lc.startsWith("es-ar")) return "ar";
  if (lc.startsWith("es-mx")) return "mx";
  if (lc.startsWith("es-es") || lc.startsWith("ca")) return "es";
  if (lc.startsWith("es-ve")) return "ve";
  if (lc.startsWith("es-cl")) return "cl";
  if (lc.startsWith("es-co")) return "co";
  if (lc.startsWith("es-pe")) return "pe";
  if (lc.startsWith("pt")) return "br";
  if (lc.startsWith("en")) return "us";
  // No region suffix on Spanish ⇒ no asumimos país; mostramos selector limpio
  return "default";
}

export function presetsFor(region: Region): RegionPresets {
  return PRESETS[region] ?? PRESETS.default;
}

export const ALL_REGIONS: { region: Region; label: string; flag: string }[] = [
  { region: "ar",      label: "Argentina",            flag: "🇦🇷" },
  { region: "ve",      label: "Venezuela",            flag: "🇻🇪" },
  { region: "co",      label: "Colombia",             flag: "🇨🇴" },
  { region: "mx",      label: "México",               flag: "🇲🇽" },
  { region: "cl",      label: "Chile",                flag: "🇨🇱" },
  { region: "pe",      label: "Perú",                 flag: "🇵🇪" },
  { region: "br",      label: "Brasil",               flag: "🇧🇷" },
  { region: "es",      label: "España",               flag: "🇪🇸" },
  { region: "us",      label: "Estados Unidos",       flag: "🇺🇸" },
  { region: "default", label: "Otro / Internacional", flag: "🌐" },
];
