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
  ensureManifest(contactout);
  ensureManifest(lusha);
  return [contactout, lusha];
};

module.exports = {
  getExtensionPaths,
};
