const fs = require("fs");
const path = require("path");
const { extensionsDir } = require("../../config/paths");

const ensureManifest = (dir) => {
  const manifest = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifest)) {
    throw new Error(`Extension manifest not found: ${manifest}`);
  }
};

const getExtensionPaths = () => {
  const contactout = path.join(extensionsDir, "contactout");
  const lusha = path.join(extensionsDir, "lusha");
  const signalhire = path.join(extensionsDir, "Signalhire");
  ensureManifest(contactout);
  ensureManifest(lusha);
  ensureManifest(signalhire);
  return [contactout, lusha, signalhire];
};

module.exports = {
  getExtensionPaths,
};
