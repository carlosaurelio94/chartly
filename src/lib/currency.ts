export type CurrencyOption = {
  code: string;
  label: string;
  symbol: string;
  locale: string;
};

export const PRESET_CURRENCIES: CurrencyOption[] = [
  { code: "ARS", label: "Peso argentino", symbol: "$", locale: "es-AR" },
  { code: "VES", label: "Bolívar venezolano", symbol: "Bs.", locale: "es-VE" },
  { code: "USD", label: "Dólar", symbol: "$", locale: "en-US" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "es-ES" },
  { code: "CLP", label: "Peso chileno", symbol: "$", locale: "es-CL" },
];

export function isPresetCurrency(code: string): boolean {
  return PRESET_CURRENCIES.some((c) => c.code === code);
}

export function currencyMeta(code: string): CurrencyOption {
  return PRESET_CURRENCIES.find((c) => c.code === code) ?? {
    code,
    label: code,
    symbol: code,
    locale: "en-US",
  };
}
