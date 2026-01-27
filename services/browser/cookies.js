const { readJson } = require("../../utils/jsonFile");
const {
  cookiesFile,
  contactoutCookiesFile,
  lushaCookiesFile,
} = require("../../config/paths");

const loadCookies = () => {
  const linkedin = readJson(cookiesFile, []);
  const contactout = readJson(contactoutCookiesFile, []);
  const lusha = readJson(lushaCookiesFile, []);
  return { linkedin, contactout, lusha };
};

module.exports = {
  loadCookies,
};
