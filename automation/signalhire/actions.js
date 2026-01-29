/*
 * Updated SignalHire actions module to handle recent UI changes.
 *
 * Changes include:
 *  - Expanded button locator patterns for the floating badge.
 *  - Relaxed injection checks so the badge click is attempted even when
 *    legacy markers are missing.
 *  - Enhanced detection of the "Get Profiles" button to match synonyms
 *    such as "Get contacts", "Get contact info", "Get leads", etc.
 *  - Updated verification logic to match the same broader set of labels.
 */

const { By, until, waitForAnyVisible, waitForSalesNavReady } = require("../utils/dom");

/* Normalize options input for public functions. */
const normalizeOptions = (input) => {
  if (typeof input === "number") {
    return { timeoutMs: input };
  }
  return input || {};
};

/* Helper to run a function within an iframe context. */
const withFrame = async (driver, frameEl, fn) => {
  await driver.switchTo().frame(frameEl);
  try {
    return await fn();
  } finally {
    await driver.switchTo().defaultContent();
  }
};

/*
 * Generate possible locator strategies for the SignalHire floating badge.
 * We include several CSS and XPath selectors that cover common variations.
 * Note: We match on '478ACC' (the SVG colour code) instead of the older
 * path signature '20.4655%209.14'.
 */
const getSignalhireLocators = () => [
  By.xpath("//*[normalize-space(text())='SH']"),
  By.css("button.floating-button"),
  By.css("[role='button'].floating-button"),
  By.css("button.floating-button img[role='img']"),
  By.css("button.floating-button svg[data-testid='drag-vertical']"),
  // Match the SignalHire SVG colour code in the data URI rather than the older path signature
  By.xpath("//img[@role='img' and contains(@src,'478ACC')]/ancestor::button[1]"),
  By.xpath("//button[contains(@class,'floating-button')]"),
  By.xpath("//button[normalize-space()='SH' or .//span[normalize-space()='SH'] or .//div[normalize-space()='SH']]"),
  By.xpath("//*[@role='button' and normalize-space()='SH']")
];

/*
 * Determine whether a SignalHire action button (e.g. Get Profiles, Get contacts) is present.
 * Matches a wider range of labels to accommodate UI changes.
 */
const hasGetProfilesButton = async (driver) => {
  return driver.executeScript(`
    const buttons = Array.from(document.querySelectorAll('button'));
    const re = /get\\s+(profiles|contacts|contact info|contact|leads|people)/i;
    return buttons.some((btn) => re.test((btn.textContent || '').trim()));
  `);
};

/*
 * Wait until any of the accepted SignalHire action buttons appears or timeout.
 */
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

/*
 * Attempt to click the SignalHire badge in the current document.
 * Tries multiple locator strategies and falls back to a JS search if necessary.
 */
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
      } catch {
        // ignore individual locator errors
      }
    }
    // Filter out candidates belonging to other extensions like ContactOut or Lusha
    const filtered = [];
    if (candidates.length) {
      for (let i = 0; i < candidates.length; i += 1) {
        try {
          const html = String(await candidates[i].getAttribute('outerHTML') || '').toLowerCase();
          const text = await candidates[i].getText().catch(() => '');
          if (html.includes('contactout') || html.includes('lusha') || html.includes('seamless.ai')) {
            continue; // skip non-SignalHire buttons
          }
          filtered.push(candidates[i]);
          console.log(
            `[signalhire][debug] locator candidate text=${JSON.stringify(text)} html=${JSON.stringify(html.slice(0, 180))}`
          );
        } catch {
          filtered.push(candidates[i]);
        }
      }
      console.log(`[signalhire][debug] locator candidates=${candidates.length}, filtered=${filtered.length}`);
    }
    for (const el of filtered) {
      try {
        console.log('[signalhire] button found via locator');
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
        await driver.wait(until.elementIsVisible(el), timeoutMs);
        try {
          await el.click();
        } catch {
          await driver.executeScript("arguments[0].click();", el);
        }
        const verified = await waitForGetProfiles(driver, verifyMs);
        if (verified) {
          return true;
        }
        console.log('[signalhire] clicked locator but action button not visible yet');
      } catch {
        // ignore click errors and move to next candidate
      }
    }
  } catch {
    // fall through to JS search fallback
  }

  // Fallback: run a JS search across the document and shadow roots
  const clicked = await driver.executeScript(`
    const findFloating = (root) => {
      const buttons = Array.from(root.querySelectorAll('button.floating-button, [role=\"button\"].floating-button'));
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
    const signature = '478ACC';
    const bySignatureImg = Array.from(document.querySelectorAll("img[role='img'][src^='data:image/svg+xml']")).find((img) => {
      const src = img.getAttribute('src') || '';
      return src.includes(signature);
    });
    const byText = Array.from(document.querySelectorAll('button, [role=\"button\"]')).find((el) =>
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
        const img = wrapper.querySelector("img[role='img'][src*='478ACC']");
        if (link || img) return true;
      }
      return true;
    });
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
    console.log("[signalhire] JS clicked but action button not visible yet");
  } else {
    console.log("[signalhire] button not found in current document");
  }
  return false;
};

/*
 * High-level function to click the SignalHire badge. Performs readiness checks,
 * attempts to click using multiple strategies (CDP, wrapper, locator search),
 * and scans iframes when necessary.
 */
const clickSignalhireBadge = async (driver, options = {}) => {
  const settings = normalizeOptions(options);
  const timeoutMs = Number(settings.timeoutMs || 15000);
  const skipReadyWait = Boolean(settings.skipReadyWait);
  const mainDocWaitMs = Number(settings.mainDocWaitMs || 1200);
  const perFrameWaitMs = Number(settings.perFrameWaitMs || 250);
  const maxFrames = Number(settings.maxFrames || 6);
  const debug = settings.debug !== false;

  // Ensure Sales Navigator is ready, unless explicitly skipped
  if (!skipReadyWait) {
    await waitForSalesNavReady(driver, timeoutMs).catch(() => null);
  }

  // Click via Chrome DevTools Protocol by computing coordinates of the badge's SVG signature
  const clickByCdp = async () => {
    try {
      const signature = "478ACC";
      const rect = await driver.executeScript(`
        const img = document.querySelector(\`img[role='img'][src*='${signature}']\`);
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

  // Attempt to click using CDP coordinates first
  const cdpClicked = await clickByCdp();
  if (cdpClicked) {
    return;
  }

  // Attempt to click via wrapper (legacy wrapper exists)
  const signature = "478ACC";
  const hasWrapper = await driver
    .executeScript(`
      const wrapper = document.querySelector('.floating-button-wrapper');
      if (!wrapper) return false;
      const link = wrapper.querySelector("a[href*='signalhire.com']");
      const img = wrapper.querySelector("img[role='img'][src*='${signature}']");
      return Boolean(link || img);
    `)
    .catch(() => false);
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
        console.log("[signalhire] wrapper click did not show action button");
      }
    }
  }

  // Log current URL and title for debugging
  try {
    const currentUrl = await driver.getCurrentUrl();
    const title = await driver.getTitle().catch(() => "");
    console.log(`[signalhire] click start url=${currentUrl} title=${title}`);
  } catch {
    // ignore
  }

  // Attempt to click in the main document
  const mainClicked = await clickSignalhireButtonInCurrentDoc(driver, mainDocWaitMs);
  if (mainClicked) {
    console.log("[signalhire] clicked in main document");
    return;
  }

  // If not found, scan iframes (but avoid frames that might belong to other extensions)
  const frames = await driver.findElements(By.css("iframe"));
  console.log(`[signalhire] scanning ${frames.length} iframes`);
  for (const frame of frames.slice(0, maxFrames)) {
    try {
      const id = await frame.getAttribute("id");
      const src = (await frame.getAttribute("src")) || "";
      if (id === "LU__extension_iframe" || src.includes("contactout")) {
        continue;
      }
      console.log(`[signalhire][debug] scanning frame id=${id || ''} src=${src || ''}`);
      const clicked = await withFrame(driver, frame, () =>
        clickSignalhireButtonInCurrentDoc(driver, perFrameWaitMs)
      );
      if (clicked) {
        console.log("[signalhire] clicked inside iframe");
        return;
      }
    } catch {
      // ignore and continue scanning
    }
  }

  // If we reach here, we failed to find or click the badge
  throw new Error("SignalHire badge not found or not clickable");
};

/*
 * Click the SignalHire action button (e.g., Get Profiles/Contacts) after the sidebar is open.
 * Matches several wording variations and times out if none are found.
 */
const clickSignalhireGetProfiles = async (driver, options = {}) => {
  const settings = normalizeOptions(options);
  const timeoutMs = Number(settings.timeoutMs || 15000);
  const start = Date.now();
  for (;;) {
    const clicked = await driver.executeScript(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const matchRe = /get\\s+(profiles|contacts|contact info|contact|leads|people)/i;
      const target = buttons.find((btn) => matchRe.test((btn.textContent || '').trim()));
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
      }
      return false;
    `);
    if (clicked) {
      console.log("[signalhire] action button clicked");
      return true;
    }
    if (Date.now() - start > timeoutMs) {
      console.log("[signalhire] action button not found");
      throw new Error("SignalHire action button not found");
    }
    await driver.sleep(200);
  }
};

module.exports = {
  clickSignalhireBadge,
  clickSignalhireGetProfiles,
};
