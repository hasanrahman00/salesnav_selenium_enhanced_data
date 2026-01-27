const path = require("path");
const { dataDir } = require("../../config/paths");

const csvHeader =
  "Url Number,Page Number,Full Name,First Name,Last Name,Company Name,Title,Website,Website_one,Signalhire profile url,LinkedIn Url,Person Location";

const normalizeName = (name) => {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const createCsvPath = (listName) => {
  const safe = normalizeName(listName || "job");
  const stamp = Date.now();
  return path.join(dataDir, `${safe}-${stamp}.csv`);
};

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  if (text.includes("\"") || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
};

const toCsvRow = (record) => {
  const domains = Array.isArray(record.domains) ? record.domains : [];
  return [
    escapeCsvValue(record.urlNumber ?? ""),
    escapeCsvValue(record.pageNumber ?? ""),
    escapeCsvValue(record.fullName),
    escapeCsvValue(record.firstName),
    escapeCsvValue(record.lastName),
    escapeCsvValue(record.companyName),
    escapeCsvValue(record.title || ""),
    escapeCsvValue(domains[0] || ""),
    escapeCsvValue(domains[1] || ""),
    escapeCsvValue(record.signalhireProfileUrl || ""),
    escapeCsvValue(record.linkedinUrl || ""),
    escapeCsvValue(record.location || ""),
  ].join(",");
};

module.exports = {
  csvHeader,
  createCsvPath,
  toCsvRow,
};
