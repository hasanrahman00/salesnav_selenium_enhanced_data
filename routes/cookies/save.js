const express = require("express");
const fs = require("fs");
const path = require("path");
const { writeJson } = require("../../utils/jsonFile");
const { cookiesFile, profileDir } = require("../../config/paths");

const router = express.Router();

const parseCookies = (input) => {
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return null;
};

router.post("/linkedin", (req, res) => {
  try {
    const payload = parseCookies(req.body.cookies);
    if (!Array.isArray(payload)) {
      return res.status(400).json({ message: "Invalid JSON format" });
    }
    writeJson(cookiesFile, payload);
    return res.json({ message: "Cookies saved" });
  } catch (error) {
    return res.status(400).json({ message: "Invalid JSON format" });
  }
});

router.delete("/linkedin", (req, res) => {
  try {
    writeJson(cookiesFile, []);
    const cookieFiles = [
      path.join(profileDir, "Default", "Network", "Cookies"),
      path.join(profileDir, "Default", "Network", "Cookies-journal"),
      path.join(profileDir, "Default", "Cookies"),
      path.join(profileDir, "Default", "Cookies-journal"),
    ];
    for (const filePath of cookieFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
      } catch (error) {
        // ignore per-file errors
      }
    }
    return res.json({ message: "Cookies deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete cookies" });
  }
});

module.exports = router;
