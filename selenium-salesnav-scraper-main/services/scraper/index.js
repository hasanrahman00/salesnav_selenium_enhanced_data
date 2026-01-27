const { launchBrowser } = require("../browser/launch");
const { waitForSalesNavReady } = require("../../automation/utils/dom");
const { loadCookies } = require("../browser/cookies");
const { confirmLogin, confirmLoginInNewTab, isLoginPage } = require("./auth");

let authChecked = false;

const closeExtraTabs = async (driver) => {
  const handles = await driver.getAllWindowHandles();
  if (handles.length <= 1) {
    return;
  }
  const keep = handles[0];
  for (const handle of handles) {
    if (handle === keep) {
      continue;
    }
    try {
      await driver.switchTo().window(handle);
      await driver.sleep(300);
      const closePromise = driver.close().catch(() => {});
      await Promise.race([
        closePromise,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      await driver.sleep(300);
    } catch (error) {
      break;
    }
  }
  try {
    await driver.switchTo().window(keep);
  } catch (error) {
    // ignore if keep handle is no longer available
  }
};

const ensureLinkedInLogin = async (driver, cookies) => {
  const linkedinCheck = await confirmLogin({
    driver,
    name: "LinkedIn",
    baseUrl: "https://www.linkedin.com",
    confirmUrl: "https://www.linkedin.com/feed/",
    cookies: cookies.linkedin,
  });
  if (!linkedinCheck.ok) {
    throw new Error(`LinkedIn cookie expired. ${linkedinCheck.message}`);
  }
};

const ensureExtensionLogin = async (driver, cookies, name) => {
  if (name === "Lusha") {
    const check = await confirmLoginInNewTab({
      driver,
      name: "Lusha",
      baseUrl: "https://dashboard.lusha.com",
      confirmUrl: "https://dashboard.lusha.com/dashboard",
      cookies: cookies.lusha,
    });
    if (!check.ok) {
      throw new Error(`Lusha cookie expired. ${check.message}`);
    }
    return;
  }
  const check = await confirmLoginInNewTab({
    driver,
    name: "ContactOut",
    baseUrl: "https://contactout.com",
    confirmUrl: "https://contactout.com/lists",
    cookies: cookies.contactout,
  });
  if (!check.ok) {
    throw new Error(`ContactOut cookie expired. ${check.message}`);
  }
};

const isSalesLoginPage = (url, title) => {
  const normalized = String(url || "").toLowerCase();
  if (normalized.includes("/sales/login")) {
    return true;
  }
  return isLoginPage(url, title);
};

const startScraper = async (job) => {
  const driver = await launchBrowser();
  try {
    await driver.manage().window().maximize();
  } catch (error) {
    // ignore if maximize is not supported
  }
  const launchDelayMs = Number(process.env.LAUNCH_DELAY_MS || 1500);
  if (launchDelayMs > 0) {
    await driver.sleep(launchDelayMs);
  }
  await closeExtraTabs(driver);
  const cookies = loadCookies();
  try {
    let attemptedLinkedInAuth = false;
    if (job?.listUrl) {
      await driver.get(job.listUrl);
      const currentUrl = await driver.getCurrentUrl();
      const title = await driver.getTitle().catch(() => "");
      if (isSalesLoginPage(currentUrl, title)) {
        await ensureLinkedInLogin(driver, cookies);
        attemptedLinkedInAuth = true;
        await driver.get(job.listUrl);
      }
    }

    const shouldCloseTabs = String(process.env.CLOSE_EXTRA_TABS || "false").toLowerCase() === "true";
    if (shouldCloseTabs) {
      await closeExtraTabs(driver);
    }
    const preJobDelayMs = Number(process.env.PRE_JOB_DELAY_MS || 5000);
    if (preJobDelayMs > 0) {
      await driver.sleep(preJobDelayMs);
    }
    if (authChecked || job?.authChecked) {
      if (job?.listUrl) {
        await driver.get(job.listUrl);
      }
      return { driver, cookies, job };
    }

    if (!attemptedLinkedInAuth) {
      await ensureLinkedInLogin(driver, cookies);
    }
    await ensureExtensionLogin(driver, cookies, "Lusha");
    await ensureExtensionLogin(driver, cookies, "ContactOut");
    if (job?.listUrl) {
      await driver.get(job.listUrl);
      await waitForSalesNavReady(driver).catch(() => null);
    }
    authChecked = true;
    if (job) {
      job.authChecked = true;
    }
  } catch (error) {
    await driver.quit();
    throw error;
  }
  return { driver, cookies, job };
};

const stopScraper = async (session) => {
  if (!session || !session.driver) {
    return;
  }
  await session.driver.quit();
};

module.exports = {
  startScraper,
  stopScraper,
};
