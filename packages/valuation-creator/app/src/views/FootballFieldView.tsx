import { type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FootballFieldBar, FootballFieldResult } from "@valuation-bot/valuation-creator-core";
import { useValuationModel } from "../valuation/useValuationModel";

// Palette roles (validated default palette, references/palette.md).
const SERIES_BLUE = "#2a78d6"; // single-series magnitude
const MEAN_INK = "#0b0b0b"; // mean marker (text ink, high contrast)
const TARGET_GREEN = "#008300"; // target price reference line (status "good")
const CURRENT_INK = "#52514e"; // current price reference line (secondary ink)
const AXIS_INK = "#52514e";
const MUTED = "#898781";
const GRIDLINE = "#e1e0d9";

interface ChartRow {
  label: string;
  method: string;
  min: number;
  mean: number;
  max: number;
  /** Invisible base offset so the visible segment floats from min to max. */
  base: number;
  span: number;
}

function toRows(bars: FootballFieldBar[]): ChartRow[] {
  return bars.map((b) => ({
    label: b.label,
    method: b.method,
    min: b.min,
    mean: b.mean,
    max: b.max,
    base: b.min,
    span: b.max - b.min,
  }));
}

const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "0.82rem",
  fontVariantNumeric: "tabular-nums",
  marginTop: "1rem",
};
const thStyle: CSSProperties = { textAlign: "right", padding: "0.25rem 0.6rem", color: AXIS_INK, whiteSpace: "nowrap" };
const labelCellStyle: CSSProperties = { textAlign: "left", padding: "0.25rem 0.6rem", whiteSpace: "nowrap" };
const headStyle: CSSProperties = { ...thStyle, borderBottom: `1px solid ${GRIDLINE}`, fontWeight: 600 };
const headLabelStyle: CSSProperties = { ...labelCellStyle, borderBottom: `1px solid ${GRIDLINE}`, fontWeight: 600 };

function money(value: number): string {
  return value.toFixed(2);
}

function FootballChart({ football }: { football: FootballFieldResult }) {
  const rows = toRows(football.bars);
  const { currentPrice, targetPrice } = football;

  const lows = rows.map((r) => r.min);
  const highs = rows.map((r) => r.max);
  const dataMin = Math.min(...lows, currentPrice, targetPrice);
  const dataMax = Math.max(...highs, currentPrice, targetPrice);
  const pad = (dataMax - dataMin) * 0.08 || 1;
  const domain: [number, number] = [
    Math.max(0, Math.floor(dataMin - pad)),
    Math.ceil(dataMax + pad),
  ];

  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
          barCategoryGap="28%"
        >
          <XAxis
            type="number"
            domain={domain}
            tickFormatter={(v) => `S$${Number(v).toFixed(1)}`}
            tick={{ fill: MUTED, fontSize: 11 }}
            stroke={GRIDLINE}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fill: AXIS_INK, fontSize: 11 }}
            stroke={GRIDLINE}
          />
          <Tooltip
            formatter={(_value, _name, item) => {
              const r = item?.payload as ChartRow | undefined;
              return r ? [`S$${money(r.min)} – S$${money(r.max)} (mean S$${money(r.mean)})`, r.label] : ["", ""];
            }}
          />
          {/* Invisible offset so the coloured segment floats from min to max. */}
          <Bar dataKey="base" stackId="range" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="span" stackId="range" fill={SERIES_BLUE} radius={4} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.method} />
            ))}
            <LabelList
              dataKey="max"
              position="right"
              formatter={(v) => `S$${money(Number(v))}`}
              style={{ fill: AXIS_INK, fontSize: 10 }}
            />
          </Bar>
          {/* Mean marker per bar. */}
          {rows.map((r) => (
            <ReferenceDot
              key={`mean-${r.method}`}
              x={r.mean}
              y={r.label}
              r={4}
              fill={MEAN_INK}
              stroke="#ffffff"
              strokeWidth={1}
              ifOverflow="extendDomain"
            />
          ))}
          {/* Vertical overlay lines. */}
          <ReferenceLine
            x={currentPrice}
            stroke={CURRENT_INK}
            strokeDasharray="4 3"
            strokeWidth={2}
            label={{ value: `Current S$${money(currentPrice)}`, position: "top", fill: CURRENT_INK, fontSize: 11 }}
          />
          <ReferenceLine
            x={targetPrice}
            stroke={TARGET_GREEN}
            strokeWidth={2}
            label={{ value: `Target S$${money(targetPrice)}`, position: "top", fill: TARGET_GREEN, fontSize: 11 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FootballTable({ football }: { football: FootballFieldResult }) {
  return (
    <table style={tableStyle} data-testid="football-table">
      <caption style={{ captionSide: "top", textAlign: "left", color: MUTED, fontSize: "0.72rem", padding: "0 0 0.35rem" }}>
        Implied value per share (S$) by method — same seven bars, in Excel order.
      </caption>
      <thead>
        <tr>
          <th style={headLabelStyle}>Method</th>
          <th style={headStyle}>Low</th>
          <th style={headStyle}>Mean</th>
          <th style={headStyle}>High</th>
        </tr>
      </thead>
      <tbody>
        {football.bars.map((b) => (
          <tr key={b.method} data-testid={`football-bar-${b.method}`}>
            <td style={labelCellStyle}>{b.label}</td>
            <td style={thStyle}>{money(b.min)}</td>
            <td style={thStyle} data-testid={`football-mean-${b.method}`}>
              {money(b.mean)}
            </td>
            <td style={thStyle}>{money(b.max)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FootballFieldView() {
  const state = useValuationModel();

  if (state.status === "idle") {
    return (
      <section>
        <h2>Football field</h2>
        <p>Select a company in Search to view the football field.</p>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section>
        <h2>Football field</h2>
        <p>Loading market data…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section>
        <h2>Football field</h2>
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      </section>
    );
  }

  const { football, peersError, companyName } = state.model;

  return (
    <section>
      <h2>Football field</h2>
      <p>Valuation range by method for {companyName}.</p>

      {!football ? (
        peersError ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            Peer data unavailable: {peersError}
          </p>
        ) : (
          <p>Loading peer data…</p>
        )
      ) : (
        <>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "0.25rem 0 0.75rem" }}>
            <span data-testid="football-current-price" style={{ fontSize: "0.82rem", color: CURRENT_INK }}>
              ▏ Current price: S${money(football.currentPrice)}
            </span>
            <span data-testid="football-target-price" style={{ fontSize: "0.82rem", color: TARGET_GREEN, fontWeight: 600 }}>
              ▏ Target price: S${money(football.targetPrice)}
            </span>
          </div>
          <FootballChart football={football} />
          <FootballTable football={football} />
        </>
      )}
    </section>
  );
}
