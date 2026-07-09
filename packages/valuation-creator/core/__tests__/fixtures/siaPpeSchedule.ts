// Tier-1 fixture for the PP&E and D&A rollforward (src/forecast.ts:
// buildPpeSchedule).
//
// baseNetPPE is SIA's FY2025 ending net PPE (from `SIA_FINANCIALS.balanceSheet.netPPE`
// in siaAssumptions.ts). depreciationRateOnNetPPE and grossPpeToSalesRatio are
// the same-named driver values `deriveOperatingAssumptions`/`grossPpeToSalesRatio`
// derive from that same historical data (FY2025 D&A over the average of
// FY2024/FY2025 net PPE; average of FY2024/FY2025 gross PPE over FY2025 revenue).
// Revenue for the display-only gross PPE line is the SIA revenue forecast from
// `siaForecast.ts`'s `siaExpectedSchedules.revenue`. Capex is a direct per-year
// input (a fleet renewal programme, not derived from revenue).
//
// The expected D&A and ending net PPE schedules were computed independently
// (spreadsheet-style, line by line from the inputs below) and must be
// reproduced within ABSOLUTE_TOLERANCE_SGD_MILLIONS.

import type { PpeScheduleInput } from "../../src/forecast";

/** Absolute tolerance for comparing schedule values, in S$ millions. */
export const ABSOLUTE_TOLERANCE_SGD_MILLIONS = 0.001;

export const siaPpeScheduleInput: PpeScheduleInput = {
  baseNetPPE: 21207.5,
  depreciationRateOnNetPPE: 2308.2 / ((20390.2 + 21207.5) / 2),
  grossPpeToSalesRatio: (31553 + 33701.599999999999) / 2 / 19539.8,
  years: [
    { capitalExpenditure: 3500, revenue: 19963.65 },
    { capitalExpenditure: 4700, revenue: 20762.196 },
    { capitalExpenditure: 4100, revenue: 21488.873 },
    { capitalExpenditure: 3800, revenue: 22133.539 },
    { capitalExpenditure: 3000, revenue: 22686.878 },
  ],
};

/** Expected D&A, ending net PPE, and gross PPE schedules for years 1..5. */
export const siaPpeExpectedSchedules = {
  depreciationAndAmortisation: [
    2353.5508693990291, 2480.7806865885932, 2727.063631040628, 2879.4283880744074,
    2981.5909304575994,
  ],
  endingNetPPE: [
    22353.94913060097, 24573.168444012375, 25946.104812971746, 26866.676424897338,
    26885.08549443974,
  ],
  grossPPE: [
    33335.03913269328, 34668.440698001, 35881.836356201195, 36958.29112962774, 37882.2492845065,
  ],
} as const;
