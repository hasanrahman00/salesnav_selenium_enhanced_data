const { By, until, waitForAnyVisible, waitForSalesNavReady } = require("../utils/dom");

const normalizeOptions = (input) => {
  if (typeof input === "number") {
    return { timeoutMs: input };
  }
  return input || {};
};

const withFrame = async (driver, frameEl, fn) => {
  await driver.switchTo().frame(frameEl);
  try {
    return await fn();
  } finally {
    await driver.switchTo().defaultContent();
  }
};

const getSignalhireLocators = () => [
  By.css("button.floating-button.left-0"),
  By.css("button[class*='floating-button'][class*='left-0']"),
  By.css("button.floating-button img[role='img'][src^='data:image/svg+xml']"),
  By.xpath("//button[contains(@class,'floating-button') and contains(@class,'left-0')]") ,
  By.xpath("//button[normalize-space()='SH' or .//span[normalize-space()='SH'] or .//div[normalize-space()='SH']]") ,
  By.xpath("//*[@role='button' and normalize-space()='SH']")
];

const hasGetProfilesButton = async (driver) => {
  return driver.executeScript(`
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some((btn) => /get profiles/i.test(btn.textContent || ''));
  `);
};

const waitForGetProfiles = async (driver, timeoutMs) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await hasGetProfilesButton(driver).catch(() => false);
    if (found) {
      return true;
    }
    await driver.sleep(150);
  }
  return false;
};

const clickSignalhireButtonInCurrentDoc = async (driver, timeoutMs, verifyMs = 1200) => {
  const locators = getSignalhireLocators();
  try {
    const candidates = [];
    for (const locator of locators) {
      try {
        const el = await waitForAnyVisible(driver, [locator], Math.min(600, timeoutMs));
        if (el && !candidates.includes(el)) {
          candidates.push(el);
        }
      } catch (error) {
        // ignore
      }
    }
    for (const el of candidates) {
      console.log("[signalhire] button found via locator");
      await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
      await driver.wait(until.elementIsVisible(el), timeoutMs);
      try {
        await el.click();
      } catch (error) {
        await driver.executeScript("arguments[0].click();", el);
      }
      const verified = await waitForGetProfiles(driver, verifyMs);
      if (verified) {
        return true;
      }
      console.log("[signalhire] clicked locator but Get Profiles not visible");
    }
  } catch (error) {
    // fall through to JS search
  }
  const clicked = await driver.executeScript(`
    const svgSignature = "20.4655%209.14";
    const candidates = Array.from(document.querySelectorAll('button.floating-button'));
    const byLeft = candidates.find((btn) => btn.className.includes('left-0'));
    const byImg = candidates.find((btn) => {
      const img = btn.querySelector("img[role='img'].w-6.max-w-6");
      if (!img) return false;
      const src = img.getAttribute('src') || '';
      return src.includes(svgSignature);
    });
    const byImgFallback = Array.from(document.querySelectorAll('button img[role="img"]')).find((img) => {
      const src = img.getAttribute('src') || '';
      return src.includes(svgSignature);
    });
    const byText = Array.from(document.querySelectorAll('button, [role="button"]')).find((el) =>
      (el.textContent || '').trim() === 'SH'
    );
    const candidate = byImg?.closest('button') || byLeft || byImgFallback?.closest('button') || byText?.closest('button') || byText;
    if (candidate) {
      candidate.scrollIntoView({ block: 'center' });
      candidate.click();
      return true;
    }
    return false;
  `);
  if (clicked) {
    console.log("[signalhire] button clicked via JS fallback");
    const verified = await waitForGetProfiles(driver, verifyMs);
    if (verified) {
      return true;
    }
    console.log("[signalhire] JS clicked but Get Profiles not visible");
  } else {
    console.log("[signalhire] button not found in current document");
  }
  return false;
};

const clickSignalhireBadge = async (driver, options = {}) => {
  const settings = normalizeOptions(options);
  const timeoutMs = Number(settings.timeoutMs || 15000);
  const skipReadyWait = Boolean(settings.skipReadyWait);
  const mainDocWaitMs = Number(settings.mainDocWaitMs || 1200);
  const perFrameWaitMs = Number(settings.perFrameWaitMs || 250);
  const maxFrames = Number(settings.maxFrames || 6);
  const debug = settings.debug !== false;
  if (!skipReadyWait) {
    await waitForSalesNavReady(driver, timeoutMs).catch(() => null);
  }
  try {
    const currentUrl = await driver.getCurrentUrl();
    const title = await driver.getTitle().catch(() => "");
    console.log(`[signalhire] click start url=${currentUrl} title=${title}`);
  } catch (error) {
    // ignore
  }
  const mainClicked = await clickSignalhireButtonInCurrentDoc(driver, mainDocWaitMs);
  if (mainClicked) {
    console.log("[signalhire] clicked in main document");
    return;
  }

  const frames = await driver.findElements(By.css("iframe"));
  console.log(`[signalhire] scanning ${frames.length} iframes`);
  for (const frame of frames.slice(0, maxFrames)) {
    try {
      const clicked = await withFrame(driver, frame, () =>
        clickSignalhireButtonInCurrentDoc(driver, perFrameWaitMs)
      );
      if (clicked) {
        console.log("[signalhire] clicked inside iframe");
        return;
      }
    } catch (error) {
      // ignore and continue
    }
  }
  if (debug) {
    try {
      const mainInfo = await driver.executeScript(`
        const floating = document.querySelectorAll('button.floating-button').length;
        const imgCandidates = document.querySelectorAll("button img[role='img']").length;
        const shButtons = Array.from(document.querySelectorAll('button, [role="button"]')).filter((el) =>
          (el.textContent || '').trim() === 'SH'
        ).length;
        const sample = Array.from(document.querySelectorAll('button.floating-button')).slice(0, 3).map((b) => b.outerHTML.slice(0, 200));
        return { floating, imgCandidates, shButtons, sample };
      `);
      console.log(`[signalhire][debug] main floating=${mainInfo.floating} imgButtons=${mainInfo.imgCandidates} shButtons=${mainInfo.shButtons}`);
      if (Array.isArray(mainInfo.sample) && mainInfo.sample.length) {
        console.log(`[signalhire][debug] main samples=${JSON.stringify(mainInfo.sample)}`);
      }
    } catch (error) {
      console.log("[signalhire][debug] main debug failed");
    }
    for (const frame of frames.slice(0, maxFrames)) {
      try {
        const src = await frame.getAttribute("src");
        const id = await frame.getAttribute("id");
        const info = await withFrame(driver, frame, async () =>
          driver.executeScript(`
            const floating = document.querySelectorAll('button.floating-button').length;
            const imgCandidates = document.querySelectorAll("button img[role='img']").length;
            const shButtons = Array.from(document.querySelectorAll('button, [role="button"]')).filter((el) =>
              (el.textContent || '').trim() === 'SH'
            ).length;
            const sample = Array.from(document.querySelectorAll('button.floating-button')).slice(0, 2).map((b) => b.outerHTML.slice(0, 160));
            return { floating, imgCandidates, shButtons, sample };
          `)
        );
        console.log(`[signalhire][debug] frame id=${id || ""} src=${src || ""} floating=${info.floating} imgButtons=${info.imgCandidates} shButtons=${info.shButtons}`);
        if (Array.isArray(info.sample) && info.sample.length) {
          console.log(`[signalhire][debug] frame samples=${JSON.stringify(info.sample)}`);
        }
      } catch (error) {
        console.log("[signalhire][debug] frame debug failed");
      }
    }
  }

  throw new Error("SignalHire badge not found in main document or iframes");
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
      console.log("[signalhire] Get Profiles clicked");
      return true;
    }
    if (Date.now() - start > timeoutMs) {
      console.log("[signalhire] Get Profiles button not found");
      throw new Error("SignalHire Get Profiles button not found");
    }
    await driver.sleep(200);
  }
};

module.exports = {
  clickSignalhireBadge,
  clickSignalhireGetProfiles,
};
