// Fechas "YYYY-MM-DD" en la zona horaria del dispositivo. No usar `toISOString()` para esto: da la
// fecha en UTC, y en Panamá (UTC-5) desde las 19:00 ya devuelve el día siguiente.

/** "YYYY-MM-DD" de `d` según el reloj local. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Primer y último día del mes de `d`, como "YYYY-MM-DD" locales. */
export function monthRange(d: Date = new Date()): { from: string; to: string } {
  return {
    from: localDateISO(new Date(d.getFullYear(), d.getMonth(), 1)),
    to: localDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}
