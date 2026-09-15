/* Money — typographic hierarchy from the redesign bundle. */
import { fmtMoney } from "@/lib/format";

type Props = {
  amount: number;
  currency?: string;
  size?: number;
  weight?: 600 | 700 | 800;
  color?: string;
  sign?: boolean;
  className?: string;
};

export default function Money({
  amount, currency = "ARS", size = 28, weight = 700, color, sign = false, className,
}: Props) {
  const formatted = fmtMoney(amount, currency);
  const signed = sign && amount > 0 ? `+${formatted}` : formatted;
  const m = signed.match(/^([+\-]?)\s*([A-Z]{2,4}\s|\$|US\$|€|£)?\s*(.+)$/);
  const s = m?.[1] ?? "";
  const sym = (m?.[2] ?? "").trim();
  const num = m?.[3] ?? signed;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 1,
        fontWeight: weight,
        color: color ?? "var(--color-fg)",
        letterSpacing: "-0.5px",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
      }}
    >
      {s && <span style={{ fontSize: size * 0.6 }}>{s}</span>}
      {sym && <span style={{ fontSize: size * 0.55, opacity: 0.55, marginRight: 2 }}>{sym}</span>}
      <span style={{ fontSize: size }}>{num}</span>
    </span>
  );
}
