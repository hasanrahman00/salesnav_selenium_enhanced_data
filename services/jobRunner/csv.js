const path = require("path");
const { dataDir } = require("../../config/paths");

const csvHeader =
  "Url Number,Page Number,Profile Url,Full Name,First Name,Last Name,Title,Company Name,Person Location,Person Linkedin,Website,Website_one";

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
    escapeCsvValue(record.signalhireProfileUrl || ""),
    escapeCsvValue(record.fullName),
    escapeCsvValue(record.firstName),
    escapeCsvValue(record.lastName),
    escapeCsvValue(record.title || ""),
    escapeCsvValue(record.companyName),
    escapeCsvValue(record.location || ""),
    escapeCsvValue(record.linkedinUrl || ""),
    escapeCsvValue(domains[0] || ""),
    escapeCsvValue(domains[1] || ""),
  ].join(",");
};

module.exports = {
  csvHeader,
  createCsvPath,
  toCsvRow,
};
