import type { MarketDescriptor } from "../marketDescriptor";
import { SGX_MARKET } from "./sgx";
import { US_MARKET } from "./us";

export { US_MARKET } from "./us";
export { SGX_MARKET } from "./sgx";

/**
 * Built-in market descriptors, most-specific-first. SGX is checked before US
 * so an explicit `/SGX` or `.SI` ticker is never mistaken for a bare US
 * symbol; new markets are added here (or supplied by the caller in place of
 * this list) without changing anything else in this package.
 */
export const DEFAULT_MARKET_DESCRIPTORS: MarketDescriptor[] = [SGX_MARKET, US_MARKET];
