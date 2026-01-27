const { By, until, waitForAnyVisible, waitForSalesNavReady } = require("../utils/dom");

const normalizeOptions = (input) => {
  if (typeof input === "number") {
    return { timeoutMs: input };
  }
  return input || {};
};

const findSignalhireButton = async (driver, timeoutMs) => {
  const locators = [
    By.css("button.floating-button"),
    By.css("button[class*='floating-button']"),
    By.xpath("//button[contains(@class,'floating-button')]")
  ];
  return waitForAnyVisible(driver, locators, timeoutMs);
};

const clickSignalhireBadge = async (driver, options = {}) => {
  const settings = normalizeOptions(options);
  const timeoutMs = Number(settings.timeoutMs || 15000);
  const skipReadyWait = Boolean(settings.skipReadyWait);
  if (!skipReadyWait) {
    await waitForSalesNavReady(driver, timeoutMs).catch(() => null);
  }
  const el = await findSignalhireButton(driver, timeoutMs);
  await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
  await driver.wait(until.elementIsVisible(el), timeoutMs);
  try {
    await el.click();
  } catch (error) {
    await driver.executeScript("arguments[0].click();", el);
  }
};

const clickSignalhireGetProfiles = async (driver, options = {}) => {
  const settings = normalizeOptions(options);
  const timeoutMs = Number(settings.timeoutMs || 15000);
  const start = Date.now();
  for (;;) {
    const clicked = await driver.executeScript(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((btn) => /get profiles/i.test(btn.textContent || ''));
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
      }
      return false;
    `);
    if (clicked) {
      return true;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("SignalHire Get Profiles button not found");
    }
    await driver.sleep(200);
  }
};

module.exports = {
  clickSignalhireBadge,
  clickSignalhireGetProfiles,
};
