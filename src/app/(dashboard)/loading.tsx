/**
 * Lo que se ve mientras una pantalla del CRM trae sus datos: el menu queda
 * igual y el contenido aparece en cuanto esta, sin dejar la pantalla anterior
 * congelada al tocar una seccion.
 */
export default function Cargando() {
  return (
    <div className="flex animate-pulse flex-col gap-6" role="status" aria-label="Cargando">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="h-8 w-72 max-w-full rounded-md bg-slate-200" />
        <div className="mt-3 h-4 w-[32rem] max-w-full rounded bg-slate-100" />
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, indice) => (
          <div key={indice} className="h-20 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {Array.from({ length: 6 }, (_, indice) => (
          <div key={indice} className="flex gap-4 border-b border-slate-100 px-5 py-4 last:border-0">
            <div className="h-10 w-40 rounded bg-slate-100" />
            <div className="h-10 flex-1 rounded bg-slate-100" />
            <div className="h-10 w-48 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
