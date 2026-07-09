// Target-company (SIA) LTM/NTM financials for `applyCompsToTarget` — the
// masterprompt §6.5 comps-implied-valuation golden values are computed
// against these, together with `SIA_COMPS_PEERS`' cross-sectional statistics
// (see `SIA_COMPS_EXPECTED` in siaComps.ts).

import type { TargetFinancials } from "../../src/comps";

export const SIA_COMPS_TARGET: TargetFinancials = {
  currentPrice: 6.49,
  sharesOutstanding: 3151.9,
  ltmEarnings: 2778,
  ltmBookValueOfEquity: 15656.2,
  ltmEbitda: 4124.5,
  ltmDebt: 9510.7,
  ltmCash: 8257.1,
  ntmEarnings: 1785.4062296108814,
  ntmEbitda: 4473.7528153532076,
  ntmDebt: 9613.1015894271604,
  ntmCash: 8405.1389537723535,
};
