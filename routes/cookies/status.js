const express = require("express");
const { readJson } = require("../../utils/jsonFile");
const { cookiesFile } = require("../../config/paths");

const router = express.Router();

router.get("/linkedin/status", (req, res) => {
  const cookies = readJson(cookiesFile, []);
  const saved = Array.isArray(cookies) && cookies.length > 0;
  return res.json({ saved });
});

module.exports = router;
