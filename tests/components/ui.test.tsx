import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Money from "@/components/ui/Money";
import CircleProgress from "@/components/ui/CircleProgress";

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/[  ]/g, " ");
/** Los <span> hijos de Money: [signo?, sigla?, número]. */
const parts = (el: React.ReactElement) =>
  [...html(el).matchAll(/<span style="font-size:([\d.]+)px[^"]*">([^<]*)<\/span>/g)].map((m) => ({
    size: Number(m[1]),
    text: m[2],
  }));

describe("<Money>", () => {
  it("separa sigla y número con jerarquía tipográfica", () => {
    expect(parts(<Money amount={1500} currency="USD" size={20} />)).toEqual([
      { size: 11, text: "USD" },
      { size: 20, text: "1,500" },
    ]);
  });

  it("usa ARS y 28px por defecto", () => {
    const [sym, num] = parts(<Money amount={1234.5} />);
    expect(sym.text).toBe("ARS");
    expect(sym.size).toBeCloseTo(28 * 0.55, 6);
    expect(num).toEqual({ size: 28, text: "1.234,50" });
  });

  it("agrega + a positivos cuando sign está activo", () => {
    const p = parts(<Money amount={10} currency="USD" sign size={10} />);
    expect(p[0]).toEqual({ size: 6, text: "+" });
    expect(p.at(-1)!.text).toBe("10");
  });

  it("no agrega + a cero ni a negativos", () => {
    expect(parts(<Money amount={0} currency="USD" sign />).map((p) => p.text)).toEqual(["USD", "0"]);
    expect(parts(<Money amount={-5} currency="USD" sign />).map((p) => p.text)).toEqual(["-", "USD", "5"]);
  });

  it("monedas sin formato Intl caen al número entero", () => {
    expect(html(<Money amount={2} currency="USDT" />)).toContain("2 USDT");
  });

  it("aplica color, peso y clase", () => {
    const out = html(<Money amount={1} currency="USD" color="red" weight={800} className="big" />);
    expect(out).toContain('class="big"');
    expect(out).toContain("color:red");
    expect(out).toContain("font-weight:800");
  });

  it("sin color usa el token del tema", () => {
    expect(html(<Money amount={1} />)).toContain("color:var(--color-fg)");
  });
});

describe("<CircleProgress>", () => {
  const offset = (value: number, size = 100, stroke = 10) => {
    const m = html(<CircleProgress value={value} size={size} stroke={stroke} />).match(
      /stroke-dasharray="([\d.]+)" stroke-dashoffset="([\d.e-]+)"/,
    )!;
    return { dash: Number(m[1]), off: Number(m[2]) };
  };

  it("0% deja el arco vacío y 100% lleno", () => {
    const c = 2 * Math.PI * 45;
    expect(offset(0).dash).toBeCloseTo(c, 6);
    expect(offset(0).off).toBeCloseTo(c, 6);
    expect(offset(100).off).toBeCloseTo(0, 6);
  });

  it("50% deja medio arco", () => {
    const { dash, off } = offset(50);
    expect(off).toBeCloseTo(dash / 2, 6);
  });

  it("acota valores fuera de rango", () => {
    expect(offset(150).off).toBeCloseTo(0, 6);
    expect(offset(-20).off).toBeCloseTo(offset(0).off, 6);
  });

  it("el radio descuenta el grosor del trazo", () => {
    expect(html(<CircleProgress value={10} size={92} stroke={9} />)).toContain('r="41.5"');
  });

  it("renderiza los children en el centro", () => {
    expect(html(<CircleProgress value={10}><b>10%</b></CircleProgress>)).toContain("<b>10%</b>");
  });

  it("usa colores del tema por defecto y respeta los propios", () => {
    expect(html(<CircleProgress value={1} />)).toContain('stroke="var(--color-accent)"');
    const custom = html(<CircleProgress value={1} color="#f00" track="#eee" />);
    expect(custom).toContain('stroke="#f00"');
    expect(custom).toContain('stroke="#eee"');
  });
});
