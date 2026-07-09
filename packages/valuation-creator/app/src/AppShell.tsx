import { useState } from "react";
import { CompanySearchView } from "./views/CompanySearchView";
import { AssumptionsView } from "./views/AssumptionsView";
import { StatementsView } from "./views/StatementsView";
import { BetaWaccView } from "./views/BetaWaccView";
import { ValuationsView } from "./views/ValuationsView";
import { SensitivityView } from "./views/SensitivityView";
import { FootballFieldView } from "./views/FootballFieldView";

const SECTIONS = [
  { id: "search", label: "Search", View: CompanySearchView },
  { id: "assumptions", label: "Assumptions", View: AssumptionsView },
  { id: "statements", label: "Statements", View: StatementsView },
  { id: "beta-wacc", label: "Beta/WACC", View: BetaWaccView },
  { id: "valuations", label: "Valuations", View: ValuationsView },
  { id: "sensitivity", label: "Sensitivity", View: SensitivityView },
  { id: "football-field", label: "Football field", View: FootballFieldView },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AppShell() {
  const [activeId, setActiveId] = useState<SectionId>("search");
  const active = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];
  const ActiveView = active.View;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>
      <h1>Valuation Creator</h1>
      <nav style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveId(section.id)}
            aria-current={section.id === activeId}
            style={{
              fontWeight: section.id === activeId ? 700 : 400,
              textDecoration: section.id === activeId ? "underline" : "none",
            }}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <ActiveView />
    </div>
  );
}
