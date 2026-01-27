const { readJson } = require("../../utils/jsonFile");
const {
  cookiesFile,
  contactoutCookiesFile,
  lushaCookiesFile,
  signalhireCookiesFile,
} = require("../../config/paths");

const loadCookies = () => {
  const linkedin = readJson(cookiesFile, []);
  const contactout = readJson(contactoutCookiesFile, []);
  const lusha = readJson(lushaCookiesFile, []);
  const signalhire = readJson(signalhireCookiesFile, []);
  return { linkedin, contactout, lusha, signalhire };
};

module.exports = {
  loadCookies,
};
