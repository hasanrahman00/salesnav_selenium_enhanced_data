const { By, until, waitForAnyVisible, waitForSalesNavReady } = require("../utils/dom");

const withFrame = async (driver, frameEl, fn) => {
  await driver.switchTo().frame(frameEl);
  try {
    return await fn();
  } finally {
    await driver.switchTo().defaultContent();
  }
};

const findContactoutButton = async (driver, timeoutMs) => {
  const buttonLocators = [
    By.id("floating-button"),
    By.css("#app #floating-button"),
    By.css("img[alt='contactout']"),
  ];
  return waitForAnyVisible(driver, buttonLocators, timeoutMs);
};

const normalizeOptions = (input) => {
  if (typeof input === "number") {
    return { timeoutMs: input };
  }
  return input || {};
};

const clickContactoutBadge = async (driver, options = {}) => {
  const settings = normalizeOptions(options);
  const timeoutMs = Number(settings.timeoutMs || 15000);
  const skipReadyWait = Boolean(settings.skipReadyWait);
  const mainDocWaitMs = Number(settings.mainDocWaitMs || 1200);
  const perFrameWaitMs = Number(settings.perFrameWaitMs || 800);
  const minimizeWaitMs = Number(settings.minimizeWaitMs || 1500);
  const postMinimizeDelayMs = Number(settings.postMinimizeDelayMs || 600);
  const maxFrames = Number(settings.maxFrames || 6);

  if (!skipReadyWait) {
    await waitForSalesNavReady(driver, timeoutMs);
  }
  // reduced logging: avoid verbose extension click messages

  // Try fast script click in main document
  try {
    const fastClicked = await driver.executeScript(`
      const el = document.querySelector('#floating-button, #app #floating-button, img[alt="contactout"]');
      if (el) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    `);
    if (fastClicked) {
      return;
    }
  } catch (error) {
    // ignore and fall back to selenium click
  }

  // Try main document first
  try {
    const el = await findContactoutButton(driver, mainDocWaitMs);
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
    await driver.wait(until.elementIsVisible(el), timeoutMs);
    await el.click();
    return;
  } catch (error) {
    // fall through to iframe search
  }

  const frames = await driver.findElements(By.css("iframe"));
  // skip iframe scan logging

  let lushaFrame = null;
  for (const frame of frames.slice(0, maxFrames)) {
    try {
      const id = await frame.getAttribute("id");
      if (id === "LU__extension_iframe") {
        lushaFrame = frame;
        break;
      }
    } catch (error) {
      // ignore
    }
  }
  if (lushaFrame) {
    try {
      await withFrame(driver, lushaFrame, async () => {
        const minimize = await waitForAnyVisible(driver, [
          By.css(".minimize-icon-container"),
          By.css("img[alt='Minimize']"),
        ], minimizeWaitMs);
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", minimize);
        await driver.wait(until.elementIsVisible(minimize), minimizeWaitMs);
        await driver.executeScript("arguments[0].click();", minimize);
      });
      if (postMinimizeDelayMs > 0) {
        await driver.sleep(postMinimizeDelayMs);
      }
    } catch (error) {
      // ignore minimize errors here
    }
  }

  const directFrameLocators = [
    By.css("iframe[src*='contactout']"),
    By.css("iframe[title*='ContactOut']"),
  ];
  for (const locator of directFrameLocators) {
    try {
      const frame = await driver.findElement(locator);
      await withFrame(driver, frame, async () => {
        const el = await findContactoutButton(driver, perFrameWaitMs);
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
        await driver.wait(until.elementIsVisible(el), timeoutMs);
        await el.click();
      });
      return;
    } catch (error) {
      // ignore and continue
    }
  }
  for (const frame of frames.slice(0, maxFrames)) {
    try {
      await withFrame(driver, frame, async () => {
        const el = await findContactoutButton(driver, perFrameWaitMs);
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
        await driver.wait(until.elementIsVisible(el), timeoutMs);
        await el.click();
      });
      return;
    } catch (error) {
      // ignore and continue
    }
  }

  throw new Error("ContactOut badge not found in main document or iframes");
};

module.exports = {
  clickContactoutBadge,
};
