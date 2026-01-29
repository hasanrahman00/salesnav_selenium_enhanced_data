const { By, waitForAnyVisible, waitForSalesNavReady } = require("../utils/dom");
const { cleanName } = require("../../utils/nameCleaner");
const { clickSignalhireBadge, clickSignalhireGetProfiles } = require("./actions");

const splitName = (fullName) => {
  const cleaned = String(fullName || "").trim();
  if (!cleaned) {
    return { firstName: "", lastName: "" };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const waitForSignalhireCards = async (driver, timeoutMs) => {
  const locators = [By.css("a[href*='signalhire.com/search/people/']")];
  await waitForAnyVisible(driver, locators, timeoutMs);
};

const extractSignalhireProfiles = async (
  driver,
  { timeoutMs = 20000, debug = true, maxCards = 50 } = {}
) => {
  const t0 = Date.now();
  if (debug) {
    console.log(`[signalhire] start (timeout=${timeoutMs}ms, maxCards=${maxCards})`);
  }
  await waitForSalesNavReady(driver, timeoutMs).catch(() => null);
  try {
    const source = await driver.getPageSource();
    const injected =
      source.includes("signalhire.com") && source.includes("floating-button-wrapper");
    if (!injected) {
      throw new Error("SignalHire extension not injected on this page.");
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }
    throw new Error("SignalHire extension not injected on this page.");
  }
  await clickSignalhireBadge(driver, { timeoutMs }).catch(() => null);
  await clickSignalhireGetProfiles(driver, { timeoutMs });
  await waitForSignalhireCards(driver, timeoutMs);

  const raw = await driver.executeScript(`
    const anchors = Array.from(document.querySelectorAll("a[href*='signalhire.com/search/people/']"));
    const results = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const profileUrl = anchor.getAttribute('href') || '';
      if (!profileUrl || seen.has(profileUrl)) {
        continue;
      }
      seen.add(profileUrl);
      const card = anchor.closest('div') || anchor.parentElement;
      const fullName = (anchor.textContent || '').trim();
      const titleEl = card ? card.querySelector("div.font-medium") : null;
      const companyEl = card ? card.querySelector("a.link") : null;
      const locationEl = card ? card.querySelector("div.text-gray-500") : null;
      const linkedinEl = card ? card.querySelector("a[href*='linkedin.com/in']") : null;
      results.push({
        profileUrl,
        fullName,
        title: titleEl ? titleEl.textContent.trim() : "",
        companyName: companyEl ? companyEl.textContent.trim() : "",
        location: locationEl ? locationEl.textContent.trim() : "",
        linkedinUrl: linkedinEl ? linkedinEl.getAttribute('href') : "",
      });
      if (results.length >= ${Number.isFinite(maxCards) ? maxCards : 50}) {
        break;
      }
    }
    return results;
  `);

  const records = Array.isArray(raw) ? raw : [];
  const mapped = records.map((record) => {
    const cleanedFullName = cleanName(record.fullName || "");
    const { firstName, lastName } = splitName(cleanedFullName);
    return {
      signalhireProfileUrl: record.profileUrl || "",
      fullName: cleanedFullName,
      firstName,
      lastName,
      title: record.title || "",
      companyName: record.companyName || "",
      location: record.location || "",
      linkedinUrl: record.linkedinUrl || "",
    };
  });
  if (debug) {
    console.log(`[signalhire] done ${Date.now() - t0}ms count=${mapped.length}`);
  }
  return mapped;
};

module.exports = {
  extractSignalhireProfiles,
};
