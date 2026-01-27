const fs = require("fs");
const path = require("path");

const ensureParentDir = (filePath) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
};

const ensureCsvHeader = (filePath, header) => {
  ensureParentDir(filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${header}\n`, "utf8");
  }
};

const appendCsvRow = (filePath, row) => {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${row}\n`, "utf8");
};

module.exports = {
  ensureCsvHeader,
  appendCsvRow,
};
