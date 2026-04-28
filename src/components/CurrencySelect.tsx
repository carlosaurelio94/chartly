"use client";

import { useState } from "react";
import { PRESET_CURRENCIES, isPresetCurrency } from "@/lib/currency";

export default function CurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const presetSelected = isPresetCurrency(value);
  const [custom, setCustom] = useState(presetSelected ? "" : value);
  const mode: "preset" | "custom" = presetSelected || !value ? "preset" : "custom";

  return (
    <div className="space-y-2">
      <select
        className="input"
        value={mode === "preset" ? value : "__custom"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom") {
            onChange(custom || "XXX");
          } else {
            onChange(v);
          }
        }}
      >
        {PRESET_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label} ({c.code})
          </option>
        ))}
        <option value="__custom">Otra moneda…</option>
      </select>
      {mode === "custom" && (
        <input
          className="input"
          placeholder="Código (ej. BRL, COP, GBP)"
          value={custom}
          maxLength={6}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setCustom(v);
            onChange(v || "XXX");
          }}
        />
      )}
    </div>
  );
}
