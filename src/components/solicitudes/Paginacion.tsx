import Link from "next/link";

export type PaginacionProps = {
  pagina: number;
  totalPaginas: number;
  mostrando: number;
  filtradas: number;
  total: number;
  /** Pagina base del listado ("/solicitudes", "/seguimiento"). */
  ruta: string;
  /** Como se llaman los elementos en el texto ("solicitudes", "consultas"). */
  sustantivo?: string;
  /** Query actual, para conservar los filtros al cambiar de pagina. */
  params: Record<string, string>;
};

function hrefPagina(ruta: string, params: Record<string, string>, pagina: number): string {
  const query = new URLSearchParams(params);
  if (pagina > 1) query.set("pagina", String(pagina));
  else query.delete("pagina");
  const texto = query.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

/** Numeros a mostrar: siempre la primera, la ultima y las vecinas de la actual. */
function numerosVisibles(pagina: number, totalPaginas: number): (number | "…")[] {
  const numeros: (number | "…")[] = [];
  for (let n = 1; n <= totalPaginas; n += 1) {
    if (n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 1) {
      numeros.push(n);
    } else if (numeros.at(-1) !== "…") {
      numeros.push("…");
    }
  }
  return numeros;
}

const BASE = "rounded-md px-2.5 py-1 text-sm";

export function Paginacion({
  pagina,
  totalPaginas,
  mostrando,
  filtradas,
  total,
  ruta,
  sustantivo = "solicitudes",
  params,
}: PaginacionProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-blue-50/40 px-5 py-3">
      <p className="text-sm text-slate-600">
        Mostrando <strong className="text-slate-900">{mostrando}</strong> de{" "}
        <strong className="text-slate-900">{filtradas}</strong> {sustantivo} filtradas (
        {total} totales)
      </p>
      <nav className="flex items-center gap-1" aria-label="Paginacion">
        {pagina > 1 ? (
          <Link href={hrefPagina(ruta, params, pagina - 1)} className={`${BASE} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
            Anterior
          </Link>
        ) : (
          <span className={`${BASE} bg-slate-100 text-slate-400`}>Anterior</span>
        )}
        {numerosVisibles(pagina, totalPaginas).map((numero, indice) =>
          numero === "…" ? (
            <span key={`hueco-${indice}`} className="px-1 text-sm text-slate-400">
              …
            </span>
          ) : (
            <Link
              key={numero}
              href={hrefPagina(ruta, params, numero)}
              aria-current={numero === pagina ? "page" : undefined}
              className={`${BASE} ${
                numero === pagina
                  ? "bg-blue-700 font-medium text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {numero}
            </Link>
          ),
        )}
        {pagina < totalPaginas ? (
          <Link href={hrefPagina(ruta, params, pagina + 1)} className={`${BASE} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
            Siguiente
          </Link>
        ) : (
          <span className={`${BASE} bg-slate-100 text-slate-400`}>Siguiente</span>
        )}
      </nav>
    </div>
  );
}
