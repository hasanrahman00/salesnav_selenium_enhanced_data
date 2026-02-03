const port = Number(process.env.PORT || 3005);
const enricherBaseUrl = String(process.env.ENRICHER_BASE_URL || "http://localhost:3006");

module.exports = {
  port,
  enricherBaseUrl,
};
