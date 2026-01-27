const express = require("express");
const { writeJson } = require("../../utils/jsonFile");
const { cookiesFile } = require("../../config/paths");

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

module.exports = router;
