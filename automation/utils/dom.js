const { By, until } = require("selenium-webdriver");

const waitForAnyVisible = async (driver, locators, timeoutMs) => {
  const start = Date.now();
  for (;;) {
    for (const locator of locators) {
      try {
        const el = await driver.findElement(locator);
        const visible = await el.isDisplayed();
        if (visible) {
          return el;
        }
      } catch (error) {
        // ignore and keep trying
      }
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for page content to be visible");
    }
    await driver.sleep(150);
  }
};

const waitForSalesNavReady = async (driver, timeoutMs = 30000) => {
  await driver.wait(async () => {
    const ready = await driver.executeScript("return document.readyState");
    return ready === "complete";
  }, timeoutMs);

  const locators = [
    By.css("main"),
    By.css("div.search-results__result-item"),
    By.css("section.search-results__result-list"),
    By.css("div.search-results__result-list"),
    By.css("[data-test-search-results]")
  ];

  await waitForAnyVisible(driver, locators, timeoutMs);
};

const getExtensionLocators = (name) => {
  const lower = name.toLowerCase();
  if (lower === "lusha") {
    return [
      By.id("LU__extension_badge_main"),
      By.id("LU__extension_badge_wrapper"),
      By.id("LU__extension_badge_logo"),
      By.css("[aria-label*='Lusha']"),
      By.css("[title*='Lusha']"),
      By.xpath("//*[contains(@class,'lusha') and (self::div or self::button)]"),
      By.xpath("//*[contains(., 'Lusha') and (self::div or self::button)]"),
      By.xpath("//img[contains(@alt,'Lusha')]/ancestor::*[self::div or self::button]")
    ];
  }
  return [];
};

const clickExtensionIcon = async (driver, name, timeoutMs = 15000) => {
  const locators = getExtensionLocators(name);
  if (!locators.length) {
    throw new Error(`Unknown extension name: ${name}`);
  }
  // reduced logging: avoid noisy locator details
  const el = await waitForAnyVisible(driver, locators, timeoutMs);
  await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
  await driver.wait(until.elementIsVisible(el), timeoutMs);
  try {
    await el.click();
  } catch (error) {
    await driver.executeScript("arguments[0].click();", el);
  }
};

module.exports = {
  By,
  until,
  waitForAnyVisible,
  waitForSalesNavReady,
  clickExtensionIcon,
};
