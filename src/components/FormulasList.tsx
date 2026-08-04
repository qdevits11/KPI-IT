import { FORMULAS, CATEGORY_LABELS } from "@/lib/formulas";
import type { KpiCategory } from "@/lib/types";

const ORDER: KpiCategory[] = [
  "sla",
  "metier",
  "odoo",
  "phishing",
  "production",
  "ticketing",
];

export function FormulasList() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Formules & sources
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Alignées sur <code className="text-[var(--accent)]">Becoflex/KPI.xlsx</code> —
          chaque indicateur du tableau de bord correspond à une formule Excel
          (COUNTIFS, SUMIFS, cumul YTD).
        </p>
      </div>

      {ORDER.map((cat) => {
        const items = FORMULAS.filter((f) => f.category === cat);
        return (
          <section key={cat} className="space-y-4">
            <h2 className="border-b border-[var(--line)] pb-2 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              {CATEGORY_LABELS[cat]}
            </h2>
            <div className="space-y-4">
              {items.map((f) => (
                <article
                  key={f.id}
                  id={f.id}
                  className="scroll-mt-24 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg text-[var(--ink)]">{f.name}</h3>
                    {f.excelSheet && (
                      <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                        Feuille : {f.excelSheet}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {f.description}
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--wash)] px-3 py-2 font-mono text-sm text-[var(--accent-deep)]">
                    {f.formula}
                  </pre>
                  <ul className="mt-3 space-y-1 text-sm">
                    {f.inputs.map((input) => (
                      <li key={input.name} className="text-[var(--ink-soft)]">
                        <span className="font-medium text-[var(--ink)]">
                          {input.name}
                        </span>{" "}
                        <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                          ({input.source})
                        </span>{" "}
                        — {input.description}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    Exemple : {f.example}
                  </p>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
