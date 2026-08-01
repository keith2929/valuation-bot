// Load API keys and configuration from environment variables
// Following the .env/.env.example convention: secrets in .env (gitignored),
// documentation in .env.example (committed)

const config = {
  fmpApiKey: process.env.FMP_API_KEY,
  alphaVantageApiKey: process.env.ALPHAVANTAGE_API_KEY,
  polygonApiKey: process.env.POLYGON_API_KEY,
  secEdgarUserAgent: process.env.SEC_EDGAR_USER_AGENT,
};

/**
 * Check if a data source has its required API key configured.
 * Returns true only if the key is present and non-empty.
 * @param {string} source - The data source name: "fmp", "alphavantage", "polygon", "secedgar"
 * @returns {boolean} True if the key is configured, false otherwise
 */
function hasKey(source) {
  const sourceMap = {
    fmp: config.fmpApiKey,
    alphavantage: config.alphaVantageApiKey,
    polygon: config.polygonApiKey,
    secedgar: config.secEdgarUserAgent,
  };

  const key = sourceMap[source.toLowerCase()];
  return Boolean(key && key.trim());
}

module.exports = {
  fmpApiKey: config.fmpApiKey,
  alphaVantageApiKey: config.alphaVantageApiKey,
  polygonApiKey: config.polygonApiKey,
  secEdgarUserAgent: config.secEdgarUserAgent,
  hasKey,
};
