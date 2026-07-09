import { type CSSProperties } from "react";
import type { SensitivityGrid } from "@valuation-bot/valuation-creator-core";
import { useValuationModel } from "../valuation/useValuationModel";
import { useAssumptions } from "../assumptions/AssumptionsContext";

// ---------------------------------------------------------------------------
// Sequential blue ramp (validated default palette, references/palette.md).
// Low per-share value -> light (recedes toward the surface), high -> dark.
// Colour is the "magnitude" job, so a single-hue sequential scale is correct.
// ---------------------------------------------------------------------------
const SEQUENTIAL_BLUE = [
  "#cde2fb", // 100
  "#9ec5f4", // 200
  "#6da7ec", // 300
  "#3987e5", // 400
  "#256abf", // 500
  "#184f95", // 600
  "#0d366b", // 700
] as const;

const MUTED = "#898781";
const GRIDLINE = "#e1e0d9";
const AXIS_INK = "#52514e";
const CENTRE_RING = "#0b0b0b";

/** Hex-lerp between two `#rrggbb` colours at t in [0, 1]. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const ch = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Sample the sequential ramp at normalised position t in [0, 1]. */
function rampColour(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (SEQUENTIAL_BLUE.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(SEQUENTIAL_BLUE.length - 1, lo + 1);
  return lerpHex(SEQUENTIAL_BLUE[lo]!, SEQUENTIAL_BLUE[hi]!, scaled - lo);
}

const sectionTitleStyle: CSSProperties = { fontWeight: 600, margin: "1.25rem 0 0.5rem" };
const tableStyle: CSSProperties = {
  borderCollapse: "separate",
  borderSpacing: 2, // 2px surface gap between cells, per the mark spec
  fontSize: "0.8rem",
  fontVariantNumeric: "tabular-nums",
  marginBottom: "0.5rem",
};
const cornerStyle: CSSProperties = {
  padding: "0.25rem 0.5rem",
  fontSize: "0.7rem",
  color: MUTED,
  textAlign: "left",
  fontWeight: 400,
  whiteSpace: "pre-line",
};
const colHeadStyle: CSSProperties = {
  padding: "0.25rem 0.5rem",
  color: AXIS_INK,
  fontWeight: 600,
  textAlign: "center",
};
const rowHeadStyle: CSSProperties = {
  padding: "0.25rem 0.6rem",
  color: AXIS_INK,
  fontWeight: 600,
  textAlign: "right",
  whiteSpace: "nowrap",
};
const cellBaseStyle: CSSProperties = {
  padding: "0.3rem 0.55rem",
  textAlign: "right",
  borderRadius: 4,
  minWidth: "3.4rem",
};
const nullCellStyle: CSSProperties = {
  ...cellBaseStyle,
  color: MUTED,
  background: "#f4f4f1",
  textAlign: "center",
};

interface HeatmapProps {
  title: string;
  caption: string;
  grid: SensitivityGrid;
  /** Base implied price expected at the grid's centre cell. */
  centreValue: number;
  /** Row axis (WACC / cost of equity) already carries decimals -> percent. */
  formatRow: (value: number) => string;
  /** Column axis formatter (percent for TGR/margin, "x" for multiples). */
  formatColumn: (value: number) => string;
  testId: string;
}

function Heatmap({ title, caption, grid, centreValue, formatRow, formatColumn, testId }: HeatmapProps) {
  const flat = grid.values.flat().filter((v): v is number => v !== null);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const span = max - min || 1;
  const centreRow = (grid.rows.values.length - 1) / 2;
  const centreCol = (grid.columns.values.length - 1) / 2;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={sectionTitleStyle}>{title}</div>
      <table style={tableStyle} data-testid={testId}>
        <caption style={{ captionSide: "top", textAlign: "left", color: MUTED, fontSize: "0.72rem", padding: "0 0 0.35rem" }}>
          {caption} — cell = implied price per share (S$); darker = higher.
        </caption>
        <thead>
          <tr>
            <th style={cornerStyle}>{`${grid.rows.label} ↓\n${grid.columns.label} →`}</th>
            {grid.columns.values.map((c, ci) => (
              <th key={ci} style={colHeadStyle} scope="col">
                {formatColumn(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.values.map((rowCells, ri) => (
            <tr key={ri}>
              <th style={rowHeadStyle} scope="row">
                {formatRow(grid.rows.values[ri]!)}
              </th>
              {rowCells.map((value, ci) => {
                if (value === null) {
                  return (
                    <td key={ci} style={nullCellStyle} title="Undefined (growth ≥ discount rate)">
                      —
                    </td>
                  );
                }
                const t = (value - min) / span;
                const isCentre = ri === centreRow && ci === centreCol;
                const style: CSSProperties = {
                  ...cellBaseStyle,
                  background: rampColour(t),
                  color: t > 0.55 ? "#ffffff" : "#0b0b0b",
                  ...(isCentre
                    ? { outline: `2px solid ${CENTRE_RING}`, outlineOffset: -2, fontWeight: 700 }
                    : {}),
                };
                return (
                  <td
                    key={ci}
                    style={style}
                    title={`${grid.rows.label} ${formatRow(grid.rows.values[ri]!)}, ${grid.columns.label} ${formatColumn(
                      grid.columns.values[ci]!,
                    )}: S$${value.toFixed(4)}`}
                    data-testid={isCentre ? `${testId}-centre` : undefined}
                    data-centre={isCentre ? "true" : undefined}
                  >
                    {value.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.72rem", color: MUTED }}>
        Centre (outlined) base implied price: S${centreValue.toFixed(4)}
      </p>
    </div>
  );
}

function pct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function mult(value: number): string {
  return `${value.toFixed(2)}x`;
}

// ---------------------------------------------------------------------------
// Editable step-size panel (wired to the shared assumptions state)
// ---------------------------------------------------------------------------
const stepFieldStyle: CSSProperties = {
  width: "5.5rem",
  padding: "0.2rem 0.35rem",
  border: `1px solid ${GRIDLINE}`,
  borderRadius: 4,
  color: "#1d4ed8", // blue = editable input, per the model's colour convention
  fontVariantNumeric: "tabular-nums",
};

const STEP_FIELDS: { key: keyof StepSizes; label: string; scale: "percent" | "plain" }[] = [
  { key: "wacc", label: "WACC step", scale: "percent" },
  { key: "dcfTerminalGrowth", label: "DCF terminal growth step", scale: "percent" },
  { key: "terminalEbitdaMargin", label: "Terminal EBITDA margin step", scale: "percent" },
  { key: "exitMultiple", label: "Exit multiple step", scale: "plain" },
  { key: "ddmCostOfEquity", label: "DDM cost of equity step", scale: "percent" },
  { key: "ddmTerminalGrowth", label: "DDM terminal growth step", scale: "percent" },
];

type StepSizes = {
  wacc: number;
  dcfTerminalGrowth: number;
  terminalEbitdaMargin: number;
  exitMultiple: number;
  ddmCostOfEquity: number;
  ddmTerminalGrowth: number;
};

function StepSizePanel() {
  const { assumptions, setAssumptions } = useAssumptions();
  const steps = assumptions.sensitivityStepSizes;

  const update = (key: keyof StepSizes, raw: string, scale: "percent" | "plain") => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = scale === "percent" ? parsed / 100 : parsed;
    setAssumptions((prev) => ({
      ...prev,
      sensitivityStepSizes: { ...prev.sensitivityStepSizes, [key]: next },
    }));
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={sectionTitleStyle}>Grid step sizes</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.25rem" }}>
        {STEP_FIELDS.map(({ key, label, scale }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", fontSize: "0.72rem", color: AXIS_INK }}>
            {label}
            {scale === "percent" ? " (%)" : ""}
            <input
              type="number"
              step="any"
              style={stepFieldStyle}
              data-testid={`step-${key}`}
              value={scale === "percent" ? Number((steps[key] * 100).toFixed(6)) : steps[key]}
              onChange={(e) => update(key, e.target.value, scale)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function SensitivityView() {
  const state = useValuationModel();

  if (state.status === "idle") {
    return (
      <section>
        <h2>Sensitivity</h2>
        <p>Select a company in Search to view sensitivity grids.</p>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section>
        <h2>Sensitivity</h2>
        <p>Loading market data…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section>
        <h2>Sensitivity</h2>
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      </section>
    );
  }

  const { grids, centres, companyName } = state.model;

  return (
    <section>
      <h2>Sensitivity</h2>
      <p>Per-share value heatmaps for {companyName}. Each grid's centre cell (outlined) is the base-case implied price.</p>

      <StepSizePanel />

      <Heatmap
        title="DCF — Gordon Growth"
        caption="WACC × terminal growth rate"
        grid={grids.dcfGordon}
        centreValue={centres.dcfGordon}
        formatRow={(v) => pct(v, 1)}
        formatColumn={(v) => pct(v, 1)}
        testId="grid-dcf-gordon"
      />

      <Heatmap
        title="DCF — Exit Multiple (terminal EBITDA margin)"
        caption="WACC × terminal EBITDA margin"
        grid={grids.dcfExitMargin}
        centreValue={centres.dcfExitMargin}
        formatRow={(v) => pct(v, 1)}
        formatColumn={(v) => pct(v, 2)}
        testId="grid-dcf-exit-margin"
      />

      <Heatmap
        title="DCF — Exit Multiple (EV/EBITDA)"
        caption="WACC × exit multiple"
        grid={grids.dcfExitMultiple}
        centreValue={centres.dcfExitMultiple}
        formatRow={(v) => pct(v, 1)}
        formatColumn={mult}
        testId="grid-dcf-exit-multiple"
      />

      <Heatmap
        title="DDM"
        caption="Cost of equity × terminal growth rate"
        grid={grids.ddm}
        centreValue={centres.ddm}
        formatRow={(v) => pct(v, 1)}
        formatColumn={(v) => pct(v, 1)}
        testId="grid-ddm"
      />
    </section>
  );
}
