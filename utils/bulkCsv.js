const cleanCell = (value) => {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim().replace(/^"|"$/g, "");
};

const detectDelimiter = (line) => {
  if (line.includes("\t")) {
    return "\t";
  }
  if (line.includes(";")) {
    return ";";
  }
  return ",";
};

const parseBulkCsv = (csvText) => {
  if (!csvText || typeof csvText !== "string") {
    throw new Error("CSV text is required");
  }
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error("CSV is empty");
  }
  const delimiter = detectDelimiter(lines[0]);
  const parseLine = (line) => line.split(delimiter).map(cleanCell);
  const firstRow = parseLine(lines[0]);
  const hasHeader = firstRow.some((cell) => /url/i.test(cell));
  const startIndex = hasHeader ? 1 : 0;
  const results = [];
  const errors = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const cols = parseLine(lines[i]);
    if (cols.length < 2) {
      errors.push(`Line ${i + 1} must have 2 columns`);
      continue;
    }
    const urlNumber = Number(cols[0]);
    const url = cols[1];
    if (!Number.isFinite(urlNumber) || urlNumber <= 0) {
      errors.push(`Line ${i + 1} has invalid URL number`);
      continue;
    }
    if (!url || !/^https?:\/\//i.test(url)) {
      errors.push(`Line ${i + 1} has invalid URL`);
      continue;
    }
    results.push({ urlNumber, url });
  }
  if (errors.length) {
    throw new Error(errors.slice(0, 3).join("; "));
  }
  if (results.length === 0) {
    throw new Error("No valid rows found in CSV");
  }
  return results;
};

module.exports = {
  parseBulkCsv,
};
