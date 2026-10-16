"use client";

/* Fecha/hora en la zona horaria del teléfono.

   El servidor corre en UTC: si formatea "7:10 p. m." para alguien en Argentina
   escribe "10:10 p. m.", React detecta que no coincide con lo que calcula el
   navegador (error #418) y la pantalla parpadea. Acá el servidor no escribe la
   hora; se completa en el cliente apenas monta. */

import { useEffect, useState } from "react";

export default function LocalTime({
  iso,
  options = { dateStyle: "short", timeStyle: "short" },
  className,
}: {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(new Intl.DateTimeFormat("es-AR", options).format(new Date(iso)));
    // options suele ser un literal: comparar por valor evita re-formatear en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, JSON.stringify(options)]);
  return (
    <time dateTime={iso} className={className}>
      {text ?? " "}
    </time>
  );
}
