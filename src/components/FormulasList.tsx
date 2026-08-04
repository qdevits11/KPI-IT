import { FORMULAS, CATEGORY_LABELS } from "@/lib/formulas";
import type { KpiCategory } from "@/lib/types";

const ORDER: KpiCategory[] = [
  "tickets",
  "appareils",
  "odoo",
  "metier",
  "phishing",
  "production",
];

export function FormulasList() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Formules & sources
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Chaque chiffre du tableau de bord est dérivé de données brutes
          (Jira ou saisie manuelle) via une formule documentée ici.
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
                  <h3 className="text-lg text-[var(--ink)]">{f.name}</h3>
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
