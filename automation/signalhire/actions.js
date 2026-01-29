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
  By.xpath("//*[normalize-space(text())='SH']"),
  By.css("button.floating-button"),
  By.css("[role='button'].floating-button"),
  By.css("button.floating-button img[role='img']"),
  By.css("button.floating-button svg[data-testid='drag-vertical']"),
  By.xpath("//img[@role='img' and contains(@src,'20.4655%209.14')]/ancestor::button[1]"),
  By.xpath("//button[contains(@class,'floating-button')]") ,
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
    if (candidates.length) {
      console.log(`[signalhire][debug] locator candidates=${candidates.length}`);
      for (let i = 0; i < candidates.length; i += 1) {
        try {
          const html = await candidates[i].getAttribute("outerHTML");
          const text = await candidates[i].getText().catch(() => "");
          console.log(`[signalhire][debug] locator[${i}] text=${JSON.stringify(text)} html=${JSON.stringify(String(html || "").slice(0, 180))}`);
        } catch (error) {
          // ignore
        }
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
    const findFloating = (root) => {
      const buttons = Array.from(root.querySelectorAll('button.floating-button, [role="button"].floating-button'));
      if (buttons.length) return buttons;
      return Array.from(root.querySelectorAll('button')).filter((btn) =>
        btn.querySelector("img[role='img']") || btn.querySelector("svg[data-testid='drag-vertical']")
      );
    };

    const findInShadow = (root) => {
      const results = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node = walker.currentNode;
      while (node) {
        if (node.shadowRoot) {
          results.push(...findFloating(node.shadowRoot));
        }
        node = walker.nextNode();
      }
      return results;
    };

    const signature = '20.4655%209.14';
    const bySignatureImg = Array.from(document.querySelectorAll("img[role='img'][src^='data:image/svg+xml']")).find((img) => {
      const src = img.getAttribute('src') || '';
      return src.includes(signature);
    });
    const byText = Array.from(document.querySelectorAll('button, [role="button"]')).find((el) =>
      (el.textContent || '').trim() === 'SH'
    );
    const candidates = [
      ...findFloating(document),
      ...findInShadow(document),
      ...(bySignatureImg ? [bySignatureImg.closest('button')] : []),
      ...(byText ? [byText.closest('button') || byText] : []),
    ].filter(Boolean);

    const filtered = candidates.filter((el) => {
      const html = (el.outerHTML || '').toLowerCase();
      if (html.includes('contactout') || html.includes('lusha')) {
        return false;
      }
      const wrapper = el.closest('.floating-button-wrapper');
      if (wrapper) {
        const link = wrapper.querySelector("a[href*='signalhire.com']");
        const img = wrapper.querySelector("img[role='img'][src*='20.4655%209.14']");
        if (link || img) {
          return true;
        }
      }
      return false;
    });

    const debug = {
      total: candidates.length,
      filtered: filtered.length,
      samples: candidates.slice(0, 3).map((el) => (el.outerHTML || '').slice(0, 140)),
      filteredSamples: filtered.slice(0, 3).map((el) => (el.outerHTML || '').slice(0, 140)),
    };
    if (debug.total || debug.filtered) {
      console.log('[signalhire][debug] js candidates', JSON.stringify(debug));
    }

    const candidate = filtered[0];
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
  const clickByCdp = async () => {
    try {
      const signature = "20.4655%209.14";
      const rect = await driver.executeScript(`
        const img = document.querySelector("img[role='img'][src*='${signature}']");
        if (!img) return null;
        const button = img.closest('button') || img;
        const r = button.getBoundingClientRect();
        if (!r || r.width === 0 || r.height === 0) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      `);
      if (!rect) {
        return false;
      }
      await driver.executeCdpCommand("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: rect.x,
        y: rect.y,
        button: "none",
      });
      await driver.executeCdpCommand("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: rect.x,
        y: rect.y,
        button: "left",
        clickCount: 1,
      });
      await driver.executeCdpCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: rect.x,
        y: rect.y,
        button: "left",
        clickCount: 1,
      });
      const verified = await waitForGetProfiles(driver, timeoutMs).catch(() => false);
      if (verified) {
        console.log("[signalhire] clicked via CDP");
        return true;
      }
    } catch (error) {
      if (debug) {
        console.log("[signalhire] CDP click failed");
      }
    }
    return false;
  };
  let sourceHasSignalhire = false;
  try {
    const source = await driver.getPageSource();
    sourceHasSignalhire =
      source.includes("signalhire.com") && source.includes("floating-button-wrapper");
    if (debug) {
      console.log(`[signalhire][debug] pageSource signalhire=${sourceHasSignalhire}`);
    }
  } catch (error) {
    // ignore
  }
  const signature = "20.4655%209.14";
  const hasWrapper = await driver.executeScript(`
    const wrapper = document.querySelector('.floating-button-wrapper');
    if (!wrapper) return false;
    const link = wrapper.querySelector("a[href*='signalhire.com']");
    const img = wrapper.querySelector("img[role='img'][src*='${signature}']");
    return Boolean(link || img);
  `).catch(() => false);
  if (!hasWrapper && !sourceHasSignalhire) {
    throw new Error("SignalHire UI not found. Extension may not be injected.");
  }
  const cdpClicked = await clickByCdp();
  if (cdpClicked) {
    return;
  }
  if (hasWrapper) {
    const clicked = await driver.executeScript(`
      const wrapper = document.querySelector('.floating-button-wrapper');
      if (!wrapper) return false;
      const img = wrapper.querySelector("img[role='img'][src*='${signature}']");
      const btn = img ? img.closest('button') : wrapper.querySelector('button.floating-button');
      if (!btn) return false;
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return true;
    `);
    if (clicked) {
      const verified = await waitForGetProfiles(driver, timeoutMs);
      if (verified) {
        console.log("[signalhire] clicked via wrapper");
        return;
      }
      if (debug) {
        console.log("[signalhire] wrapper click did not show Get Profiles");
      }
    }
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

  const hasSignalhireWrapper = await driver.executeScript(`
    const wrapper = document.querySelector('.floating-button-wrapper') || document.querySelector('[class*="app-z-floating-button"]');
    if (!wrapper) return false;
    const link = wrapper.querySelector("a[href*='signalhire.com']");
    const img = wrapper.querySelector("img[role='img'][src*='${signature}']");
    return Boolean(link || img);
  `).catch(() => false);
  if (hasSignalhireWrapper) {
    throw new Error("SignalHire button present but click did not open panel.");
  }

  const frames = await driver.findElements(By.css("iframe"));
  console.log(`[signalhire] scanning ${frames.length} iframes`);
  if (hasWrapper || sourceHasSignalhire) {
    // SignalHire should be in main document; avoid iframe clicks that hit ContactOut.
    throw new Error("SignalHire button not clickable in main document.");
  }
  for (const frame of frames) {
    try {
      const id = await frame.getAttribute("id");
      const src = (await frame.getAttribute("src")) || "";
      if (id === "LU__extension_iframe" || src.includes("contactout")) {
        continue;
      }
      console.log(`[signalhire][debug] scanning frame id=${id || ""} src=${src || ""}`);
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
