const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const publicDir = path.join(rootDir, "public");
const cookiesFile = path.join(rootDir, "cookie.json");
const contactoutCookiesFile = path.join(rootDir, "contactout.json");
const lushaCookiesFile = path.join(rootDir, "lusha.json");
const extensionsDir = path.join(rootDir, "extensions");
const profileDir = path.join(rootDir, "chrome-profile");

module.exports = {
  rootDir,
  dataDir,
  publicDir,
  cookiesFile,
  contactoutCookiesFile,
  lushaCookiesFile,
  extensionsDir,
  profileDir,
};
