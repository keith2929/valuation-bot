import type { CSSProperties } from "react";
import type { ForecastAssumptions } from "@valuation-bot/valuation-creator";
import { useAssumptions } from "../assumptions/AssumptionsContext";
import { BlueInput, BlueSelect } from "../assumptions/BlueInput";
import {
  effectiveCogsPctRevenue,
  effectiveOtherOpExPctRevenue,
  effectiveRevenueGrowth,
  effectiveSgaPctRevenue,
} from "../assumptions/derived";

const FORECAST_YEARS = ["FY26", "FY27", "FY28", "FY29", "FY30"];
const SCENARIOS: ForecastAssumptions["scenario"][] = ["Bear", "Base", "Bull"];

const sectionStyle = { marginBottom: "1.75rem" };
const tableStyle: CSSProperties = { borderCollapse: "collapse", width: "100%" };
const thTdStyle: CSSProperties = { textAlign: "right", padding: "0.25rem 0.5rem" };
const rowLabelStyle: CSSProperties = { textAlign: "left", padding: "0.25rem 0.5rem", whiteSpace: "nowrap" };

function toPercentString(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function AssumptionsView() {
  const { assumptions, setAssumptions } = useAssumptions();

  function updateScalar<K extends keyof ForecastAssumptions>(key: K, value: ForecastAssumptions[K]) {
    setAssumptions((prev) => ({ ...prev, [key]: value }));
  }

  function updateArrayAt(key: "baseRevenueGrowth" | "capex" | "specialDPS", index: number, value: number) {
    setAssumptions((prev) => {
      const next = [...prev[key]];
      next[index] = value;
      return { ...prev, [key]: next };
    });
  }

  function updateCogsOverrideAt(index: number, raw: string) {
    setAssumptions((prev) => {
      const next = [...prev.cogsPctRevBaseOverrides];
      next[index] = raw === "" ? null : Number(raw);
      return { ...prev, cogsPctRevBaseOverrides: next };
    });
  }

  function updateSgaBase(value: number) {
    setAssumptions((prev) => ({ ...prev, sgaPctRev: { ...prev.sgaPctRev, base: value } }));
  }

  function updateOtherOpExBase(value: number) {
    setAssumptions((prev) => ({ ...prev, otherOpExPctRev: { ...prev.otherOpExPctRev, base: value } }));
  }

  function updateOffset(field: "revenueGrowth" | "sga" | "otherOpEx", value: number) {
    setAssumptions((prev) => ({
      ...prev,
      scenarioOffsets: { ...prev.scenarioOffsets, [field]: value },
    }));
  }

  function updateCogsOffset(field: "bear" | "bull", value: number) {
    setAssumptions((prev) => ({
      ...prev,
      scenarioOffsets: { ...prev.scenarioOffsets, cogs: { ...prev.scenarioOffsets.cogs, [field]: value } },
    }));
  }

  function updateStepSize(field: keyof ForecastAssumptions["sensitivityStepSizes"], value: number) {
    setAssumptions((prev) => ({
      ...prev,
      sensitivityStepSizes: { ...prev.sensitivityStepSizes, [field]: value },
    }));
  }

  const revenueGrowth = effectiveRevenueGrowth(assumptions);
  const cogsPctRevenue = effectiveCogsPctRevenue(assumptions);
  const sgaPctRevenue = effectiveSgaPctRevenue(assumptions);
  const otherOpExPctRevenue = effectiveOtherOpExPctRevenue(assumptions);

  return (
    <section>
      <h2>Assumptions</h2>
      <p>
        Every figure below is a hardcoded model input (Excel blue-input convention: blue text =
        editable). Values are seeded from the SIA reference model and can be overridden here.
      </p>

      <div style={sectionStyle}>
        <h3>Scenario</h3>
        <label>
          {" "}
          <BlueSelect
            aria-label="Scenario"
            value={assumptions.scenario}
            onChange={(event) => updateScalar("scenario", event.target.value as ForecastAssumptions["scenario"])}
          >
            {SCENARIOS.map((scenario) => (
              <option key={scenario} value={scenario}>
                {scenario}
              </option>
            ))}
          </BlueSelect>
        </label>
      </div>

      <div style={sectionStyle}>
        <h3>Revenue growth</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={rowLabelStyle} />
              {FORECAST_YEARS.map((year) => (
                <th key={year} style={thTdStyle}>
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>Base growth</td>
              {assumptions.baseRevenueGrowth.map((value, i) => (
                <td key={i} style={thTdStyle}>
                  <BlueInput
                    aria-label={`Base revenue growth ${FORECAST_YEARS[i]}`}
                    type="number"
                    step="0.0001"
                    value={value}
                    onChange={(event) => updateArrayAt("baseRevenueGrowth", i, Number(event.target.value))}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td style={rowLabelStyle}>Scenario offset (±)</td>
              <td style={thTdStyle} colSpan={FORECAST_YEARS.length}>
                <BlueInput
                  aria-label="Revenue growth scenario offset"
                  type="number"
                  step="0.001"
                  value={assumptions.scenarioOffsets.revenueGrowth}
                  onChange={(event) => updateOffset("revenueGrowth", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>
                Effective ({assumptions.scenario})
              </td>
              {revenueGrowth.map((value, i) => (
                <td key={i} style={thTdStyle} data-testid={`effective-revenue-growth-${i}`}>
                  {toPercentString(value)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h3>COGS / SG&amp;A / other opex</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={rowLabelStyle} />
              {FORECAST_YEARS.map((year) => (
                <th key={year} style={thTdStyle}>
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>COGS % revenue (base override)</td>
              {assumptions.cogsPctRevBaseOverrides.map((override, i) => (
                <td key={i} style={thTdStyle}>
                  <BlueInput
                    aria-label={`COGS % revenue override ${FORECAST_YEARS[i]}`}
                    type="number"
                    step="0.001"
                    placeholder={String(assumptions.cogsPctRev.base[i])}
                    value={override ?? ""}
                    onChange={(event) => updateCogsOverrideAt(i, event.target.value)}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td style={rowLabelStyle}>COGS offset — Bear / Bull</td>
              <td style={thTdStyle} colSpan={FORECAST_YEARS.length}>
                <BlueInput
                  aria-label="COGS scenario offset (Bear)"
                  type="number"
                  step="0.001"
                  value={assumptions.scenarioOffsets.cogs.bear}
                  onChange={(event) => updateCogsOffset("bear", Number(event.target.value))}
                />{" "}
                <BlueInput
                  aria-label="COGS scenario offset (Bull)"
                  type="number"
                  step="0.001"
                  value={assumptions.scenarioOffsets.cogs.bull}
                  onChange={(event) => updateCogsOffset("bull", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Effective COGS % ({assumptions.scenario})</td>
              {cogsPctRevenue.map((value, i) => (
                <td key={i} style={thTdStyle}>
                  {toPercentString(value)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>SG&amp;A % revenue (base)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="SG&A % revenue base"
                  type="number"
                  step="0.001"
                  value={assumptions.sgaPctRev.base}
                  onChange={(event) => updateSgaBase(Number(event.target.value))}
                />
              </td>
              <td style={rowLabelStyle}>offset (±)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="SG&A scenario offset"
                  type="number"
                  step="0.001"
                  value={assumptions.scenarioOffsets.sga}
                  onChange={(event) => updateOffset("sga", Number(event.target.value))}
                />
              </td>
              <td style={rowLabelStyle}>effective</td>
              <td style={thTdStyle}>{toPercentString(sgaPctRevenue)}</td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Other opex % revenue (base)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Other opex % revenue base"
                  type="number"
                  step="0.001"
                  value={assumptions.otherOpExPctRev.base}
                  onChange={(event) => updateOtherOpExBase(Number(event.target.value))}
                />
              </td>
              <td style={rowLabelStyle}>offset (±)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Other opex scenario offset"
                  type="number"
                  step="0.001"
                  value={assumptions.scenarioOffsets.otherOpEx}
                  onChange={(event) => updateOffset("otherOpEx", Number(event.target.value))}
                />
              </td>
              <td style={rowLabelStyle}>effective</td>
              <td style={thTdStyle}>{toPercentString(otherOpExPctRevenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h3>Capital expenditure</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={rowLabelStyle} />
              {FORECAST_YEARS.map((year) => (
                <th key={year} style={thTdStyle}>
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>Capex</td>
              {assumptions.capex.map((value, i) => (
                <td key={i} style={thTdStyle}>
                  <BlueInput
                    aria-label={`Capex ${FORECAST_YEARS[i]}`}
                    type="number"
                    step="1"
                    value={value}
                    onChange={(event) => updateArrayAt("capex", i, Number(event.target.value))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h3>Tax &amp; cost of capital</h3>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>Tax rate</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Tax rate"
                  type="number"
                  step="0.001"
                  value={assumptions.taxRate}
                  onChange={(event) => updateScalar("taxRate", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Risk-free rate (Rf)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Risk-free rate"
                  type="number"
                  step="0.0001"
                  value={assumptions.riskFreeRate}
                  onChange={(event) => updateScalar("riskFreeRate", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Market risk premium (MRP)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Market risk premium"
                  type="number"
                  step="0.0001"
                  value={assumptions.marketRiskPremium}
                  onChange={(event) => updateScalar("marketRiskPremium", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Pre-tax cost of debt (Kd override)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Pre-tax cost of debt"
                  type="number"
                  step="0.0001"
                  value={assumptions.preTaxCostOfDebt}
                  onChange={(event) => updateScalar("preTaxCostOfDebt", Number(event.target.value))}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h3>Terminal growth &amp; exit multiple</h3>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>DCF terminal growth rate</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="DCF terminal growth rate"
                  type="number"
                  step="0.001"
                  value={assumptions.dcfTerminalGrowth}
                  onChange={(event) => updateScalar("dcfTerminalGrowth", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>DDM terminal growth rate</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="DDM terminal growth rate"
                  type="number"
                  step="0.001"
                  value={assumptions.ddmTerminalGrowth}
                  onChange={(event) => updateScalar("ddmTerminalGrowth", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Exit multiple (default: comps EV/EBITDA LTM median)</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Exit multiple"
                  type="number"
                  step="0.01"
                  value={assumptions.exitMultiple}
                  onChange={(event) => updateScalar("exitMultiple", Number(event.target.value))}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h3>Dividends (DDM)</h3>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>Payout ratio</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Payout ratio"
                  type="number"
                  step="0.0001"
                  value={assumptions.ddmPayoutRatio}
                  onChange={(event) => updateScalar("ddmPayoutRatio", Number(event.target.value))}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={rowLabelStyle}>Special DPS</th>
              {FORECAST_YEARS.map((year) => (
                <th key={year} style={thTdStyle}>
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={rowLabelStyle} />
              {assumptions.specialDPS.map((value, i) => (
                <td key={i} style={thTdStyle}>
                  <BlueInput
                    aria-label={`Special DPS ${FORECAST_YEARS[i]}`}
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(event) => updateArrayAt("specialDPS", i, Number(event.target.value))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h3>Sensitivity step sizes</h3>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={rowLabelStyle}>WACC step</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="WACC step size"
                  type="number"
                  step="0.001"
                  value={assumptions.sensitivityStepSizes.wacc}
                  onChange={(event) => updateStepSize("wacc", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>DCF terminal growth step</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="DCF terminal growth step size"
                  type="number"
                  step="0.001"
                  value={assumptions.sensitivityStepSizes.dcfTerminalGrowth}
                  onChange={(event) => updateStepSize("dcfTerminalGrowth", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Exit multiple step</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Exit multiple step size"
                  type="number"
                  step="0.1"
                  value={assumptions.sensitivityStepSizes.exitMultiple}
                  onChange={(event) => updateStepSize("exitMultiple", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>Terminal EBITDA margin step</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="Terminal EBITDA margin step size"
                  type="number"
                  step="0.001"
                  value={assumptions.sensitivityStepSizes.terminalEbitdaMargin}
                  onChange={(event) => updateStepSize("terminalEbitdaMargin", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>DDM cost-of-equity step</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="DDM cost of equity step size"
                  type="number"
                  step="0.001"
                  value={assumptions.sensitivityStepSizes.ddmCostOfEquity}
                  onChange={(event) => updateStepSize("ddmCostOfEquity", Number(event.target.value))}
                />
              </td>
            </tr>
            <tr>
              <td style={rowLabelStyle}>DDM terminal growth step</td>
              <td style={thTdStyle}>
                <BlueInput
                  aria-label="DDM terminal growth step size"
                  type="number"
                  step="0.001"
                  value={assumptions.sensitivityStepSizes.ddmTerminalGrowth}
                  onChange={(event) => updateStepSize("ddmTerminalGrowth", Number(event.target.value))}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
