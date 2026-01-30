const fs = require("fs");
const path = require("path");
const { Builder } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const { getExtensionPaths } = require("./extensions");
const { applyStealth } = require("./stealth");
const { profileDir } = require("../../config/paths");

const launchBrowser = () => {
  const options = new chrome.Options();
  const extensions = getExtensionPaths();
  const normalizedExtensions = extensions.map((extensionPath) =>
    extensionPath.replace(/\\/g, "/")
  );
  const joined = normalizedExtensions.join(",");
  const usePersistentProfile =
    String(process.env.USE_PERSISTENT_PROFILE || "true").toLowerCase() === "true";
  const resetProfileOnStart =
    String(process.env.RESET_PROFILE_ON_START || "false").toLowerCase() === "true";

  if (usePersistentProfile) {
    if (resetProfileOnStart && fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    fs.mkdirSync(profileDir, { recursive: true });
    options.addArguments(`--user-data-dir=${profileDir}`);
    options.addArguments("--profile-directory=Default");
  } else {
    const runDir = path.join(profileDir, `run-${Date.now()}`);
    fs.mkdirSync(runDir, { recursive: true });
    options.addArguments(`--user-data-dir=${runDir}`);
  }
  options.addArguments(`--load-extension=${joined}`);
  options.addArguments(
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--disable-features=InfiniteSessionRestore",
    "--log-level=3",
    "--start-maximized",
    "--disable-gpu",
    "--use-gl=swiftshader",
    "--use-angle=swiftshader",
    "--disable-software-rasterizer",
    "--disable-accelerated-2d-canvas",
    "--disable-features=Vulkan,UseSkiaRenderer"
  );
  if (String(process.env.DEBUG_CHROME || "").toLowerCase() === "true") {
    options.addArguments("--enable-logging=stderr", "--v=1");
  }
  if (process.env.CHROME_BINARY) {
    options.setChromeBinaryPath(process.env.CHROME_BINARY);
  }
  applyStealth(options);
  const headless = String(process.env.HEADLESS || "false").toLowerCase() === "true";
  if (headless) {
    options.addArguments("--headless=new");
  }
  const builder = new Builder().forBrowser("chrome").setChromeOptions(options);
  if (process.env.CHROMEDRIVER_BINARY) {
    const service = new chrome.ServiceBuilder(process.env.CHROMEDRIVER_BINARY);
    builder.setChromeService(service);
  }
  return builder.build();
};

module.exports = {
  launchBrowser,
};
