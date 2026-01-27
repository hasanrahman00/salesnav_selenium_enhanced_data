const { By, waitForAnyVisible, waitForSalesNavReady, clickExtensionIcon, until } = require("../utils/dom");

const clickLushaMinimize = async (driver, options = {}) => {
  const timeoutMs = Number(options.timeoutMs || 1500);
  const preferFrame = options.preferFrame !== false;
  const locators = [
    By.css(".minimize-icon-container img[alt='Minimize']"),
    By.css(".minimize-icon-container"),
    By.xpath("//img[@alt='Minimize']/ancestor::*[self::div or self::button]")
  ];

  const clickEl = async () => {
    const el = await waitForAnyVisible(driver, locators, timeoutMs);
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
    await driver.wait(until.elementIsVisible(el), timeoutMs);
    try {
      await el.click();
    } catch (error) {
      await driver.executeScript("arguments[0].click();", el);
    }
  };

  const tryFastScriptClick = async () => {
    try {
      const frames = await driver.findElements(By.css("iframe"));
      for (const frame of frames) {
        const id = await frame.getAttribute("id");
        if (id && id !== "LU__extension_iframe") {
          continue;
        }
        await driver.switchTo().frame(frame);
        const clicked = await driver.executeScript(`
          const btn = document.querySelector('.minimize-icon-container img[alt="Minimize"], .minimize-icon-container');
          if (btn) {
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          }
          return false;
        `);
        await driver.switchTo().defaultContent();
        if (clicked) {
          return true;
        }
      }
    } catch (error) {
      try {
        await driver.switchTo().defaultContent();
      } catch (switchError) {
        // ignore
      }
    }
    return false;
  };

  const tryInFrame = async () => {
    const frames = await driver.findElements(By.css("iframe"));
    for (const frame of frames) {
      try {
        const id = await frame.getAttribute("id");
        if (id && id !== "LU__extension_iframe") {
          continue;
        }
        await driver.switchTo().frame(frame);
        await clickEl();
        await driver.switchTo().defaultContent();
        return true;
      } catch (error) {
        try {
          await driver.switchTo().defaultContent();
        } catch (switchError) {
          // ignore
        }
      }
    }
    return false;
  };

  if (preferFrame) {
    const fast = await tryFastScriptClick();
    if (fast) {
      return;
    }
    const ok = await tryInFrame();
    if (ok) {
      return;
    }
  }

  try {
    await clickEl();
    return;
  } catch (error) {
    // fall through to iframe search
  }

  const ok = await tryInFrame();
  if (ok) {
    return;
  }
  throw new Error("Lusha minimize button not found");
};

const clickLushaBadge = async (driver, timeoutMs = 15000) => {
  await waitForSalesNavReady(driver, timeoutMs);
  await clickExtensionIcon(driver, "lusha", timeoutMs);
};

module.exports = {
  clickLushaBadge,
  clickLushaMinimize,
};
