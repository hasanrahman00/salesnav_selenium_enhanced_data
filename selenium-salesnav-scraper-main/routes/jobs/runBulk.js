const express = require("express");
const { readJson } = require("../../utils/jsonFile");
const { cookiesFile } = require("../../config/paths");
const { parseBulkCsv } = require("../../utils/bulkCsv");
const { startBulkJob } = require("../../services/bulkJobRunner");

const router = express.Router();

router.post("/run-bulk", async (req, res) => {
  const listName = String(req.body.listName || "").trim();
  const csvText = String(req.body.csvText || "");
  if (!listName) {
    return res.status(400).json({ message: "List name is required" });
  }
  const cookies = readJson(cookiesFile, []);
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return res.status(400).json({ message: "Cookies not saved" });
  }
  try {
    const bulkUrls = parseBulkCsv(csvText);
    const job = await startBulkJob({ listName, bulkUrls });
    return res.status(201).json(job);
  } catch (error) {
    return res.status(400).json({ message: String(error.message || error) });
  }
});

module.exports = router;
