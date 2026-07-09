// Tier-2 fixture for the working-capital schedule (src/forecast.ts:
// buildWorkingCapitalSchedule).
//
// Revenue/COGS per year come straight from the Base-case income-statement
// forecast (`buildIncomeStatementForecast(siaIncomeStatementBaseInput)`,
// see siaIncomeStatement.ts) so this fixture never re-derives those figures
// independently.
//
// The days/percent-of-base driver assumptions (receivablesDays,
// inventoryDaysOfCogs, prepaidDaysOfCogs, accountsPayableDaysOfCogs,
// accruedDaysOfCogs, unearnedRevenuePctRevenue,
// otherCurrentLiabilitiesPctOfTotalCurrentLiabilities) are
// `deriveOperatingAssumptions(SIA_FINANCIALS)`'s own values (see
// assumptions.test.ts) — the same trailing-average derivation the
// working-capital schedule is meant to consume from in the app.
//
// `openingNetWorkingCapital` (FY2025) is derived directly from the FY2025
// balance sheet in siaAssumptions.ts:
//   (receivables 1593.6 + inventory 344.9 + prepaid 109.9 + otherCurrentAssets 91.9)
//   - (accountsPayable 4509.2 + accrued 50.1 + unearnedRevCurrent 5839.8 + otherCurrentLiabilities 733.2)
//   = 2140.3 - 11132.3 = -8992.0
//
// `otherCurrentAssets`/`currentLeases`/`taxesPayable` are held flat at their
// FY2025 levels (91.9 / 536.9 / 72.5).
//
// Expected NWC/changeNWC schedules and the FY26 (year 1) OCL/TCL spot check
// were computed independently (line by line from the inputs below, solving
// the OCL fixed point algebraically) and must be reproduced within
// ABSOLUTE_TOLERANCE_SGD_MILLIONS.

import { buildIncomeStatementForecast, deriveOperatingAssumptions } from "../../src/forecast";
import type { WorkingCapitalScheduleInput } from "../../src/forecast";
import { SIA_FINANCIALS } from "./siaAssumptions";
import { siaIncomeStatementBaseInput } from "./siaIncomeStatement";

/** Absolute tolerance for comparing schedule values, in S$ millions. */
export const ABSOLUTE_TOLERANCE_SGD_MILLIONS = 0.001;

/** FY2025 net working capital, from the FY2025 balance sheet (see provenance note above). */
export const SIA_OPENING_NET_WORKING_CAPITAL_FY25 = -8992.0;

const assumptions = deriveOperatingAssumptions(SIA_FINANCIALS);
const incomeStatement = buildIncomeStatementForecast(siaIncomeStatementBaseInput);

export const siaWorkingCapitalInput: WorkingCapitalScheduleInput = {
  openingNetWorkingCapital: SIA_OPENING_NET_WORKING_CAPITAL_FY25,
  receivablesDays: assumptions.receivablesDays,
  inventoryDaysOfCogs: assumptions.inventoryDaysOfCogs,
  prepaidDaysOfCogs: assumptions.prepaidDaysOfCogs,
  otherCurrentAssets: 91.9,
  accountsPayableDaysOfCogs: assumptions.accountsPayableDaysOfCogs,
  accruedDaysOfCogs: assumptions.accruedDaysOfCogs,
  unearnedRevenuePctRevenue: assumptions.unearnedRevenuePctRevenue,
  otherCurrentLiabilitiesPctOfTotalCurrentLiabilities:
    assumptions.otherCurrentLiabilitiesPctOfTotalCurrentLiabilities,
  currentLeases: 536.9,
  taxesPayable: 72.5,
  years: incomeStatement.years.map((year) => ({ revenue: year.revenue, cogs: year.cogs })),
};

/** Expected NWC level and change-in-NWC schedules for years 1..5. */
export const siaWorkingCapitalExpectedSchedules = {
  netWorkingCapital: [
    -9235.0208891391921, -9810.1454102639909, -10096.070893088425, -9977.5034045427765,
    -10178.057902319057,
  ],
  changeInNetWorkingCapital: [
    243.02088913919215, 575.12452112479878, 285.92548282443386, -118.5674885456483,
    200.55449777628019,
  ],
} as const;

/** FY2026 (year 1) other-current-liabilities spot check (the OCL algebraic solve). */
export const SIA_FY26_OTHER_CURRENT_LIABILITIES = 777.18563524448325;

/** FY2026 (year 1) total-current-liabilities spot check. */
export const SIA_FY26_TOTAL_CURRENT_LIABILITIES = 12140.760317213424;
