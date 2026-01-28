const { By, until, waitForAnyVisible, waitForSalesNavReady } = require("../utils/dom");
const { cleanName } = require("../../utils/nameCleaner");
const { clickLushaBadge } = require("./actions");
const { clickLushaPrivacyApproval } = require("./privacyApproval");

const withFrame = async (driver, frameEl, fn) => {
  await driver.switchTo().frame(frameEl);
  try {
    return await fn();
  } finally {
    await driver.switchTo().defaultContent();
  }
};

const splitName = (fullName) => {
  const cleaned = String(fullName || "").trim();
  if (!cleaned) {
    return { firstName: "", lastName: "" };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const extractDomains = (text) => {
  if (!text) {
    return [];
  }
  const matches = String(text).match(/@([a-z0-9.-]+\.[a-z]{2,})/gi) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/^@/, "").toLowerCase())));
};

const getLushaFrame = async (driver) => {
  const frames = await driver.findElements(By.css("iframe"));
  for (const frame of frames) {
    try {
      const id = await frame.getAttribute("id");
      if (id === "LU__extension_iframe") {
        return frame;
      }
    } catch (error) {
      // ignore
    }
  }
  return null;
};

const expandAllCards = async (driver) => {
  await driver.executeScript(`
    const arrows = Array.from(document.querySelectorAll(
      '.divider-and-arrow-container img[alt="Arrow Down"], .divider-and-arrow-container'
    ));
    arrows.forEach((el) => {
      const clickable = el.closest('.divider-and-arrow-container') || el;
      if (clickable) {
        clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
  `);
};

const extractLushaContacts = async (
  driver,
  { timeoutMs = 20000, maxCards = 25, debug = true, retryOnTimeout = true } = {}
) => {
  const t0 = Date.now();
  if (debug) {
    console.log(`[lusha] start (timeout=${timeoutMs}ms, maxCards=${maxCards})`);
  }
  const tReadyStart = Date.now();
  await waitForSalesNavReady(driver, timeoutMs);
  if (debug) {
    console.log(`[lusha] waitForSalesNavReady ${Date.now() - tReadyStart}ms`);
  }

  const run = async () => {
    const containerLocators = [
      By.css("[data-test-id='bulk-contact-container-with-data']"),
      By.css(".bulk-contact-profile-container"),
    ];
    const tVisible = Date.now();
    try {
      await waitForAnyVisible(driver, containerLocators, timeoutMs);
    } catch (error) {
      if (retryOnTimeout) {
        if (debug) {
          console.log("[lusha] container not visible, retrying by clicking Lusha badge");
        }
        try {
          await driver.switchTo().defaultContent();
        } catch (switchError) {
          // ignore
        }
        await clickLushaBadge(driver, Math.min(8000, timeoutMs));
        const approved = await clickLushaPrivacyApproval(driver);
        if (approved) {
          const approvalWaitMs = Number(process.env.LUSHA_APPROVAL_WAIT_MS || 1500);
          if (approvalWaitMs > 0) {
            await driver.sleep(approvalWaitMs);
          }
        }
        await waitForAnyVisible(driver, containerLocators, timeoutMs);
      } else {
        throw error;
      }
    }
    if (debug) {
      console.log(`[lusha] waitForAnyVisible ${Date.now() - tVisible}ms`);
    }
    const tExpand = Date.now();
    await expandAllCards(driver);
    await driver.sleep(150);
    if (debug) {
      console.log(`[lusha] expandAllCards ${Date.now() - tExpand}ms`);
    }
    const tScript = Date.now();
    const raw = await driver.executeScript(`
      const cards = Array.from(document.querySelectorAll('.bulk-contact-profile-container'));
      return cards.slice(0, ${maxCards}).map((card) => {
        const fullNameEl = card.querySelector('.bulk-contact-full-name');
        const companyEl = card.querySelector('.bulk-contact-company-name');
        const fullName = fullNameEl ? fullNameEl.textContent.trim() : '';
        const companyName = companyEl ? companyEl.textContent.trim() : '';
        const spans = Array.from(card.querySelectorAll('.bulk-contact-value-text .user-base.overflow-span'));
        const domains = spans
          .map((span) => (span.textContent || '').trim())
          .filter(Boolean);
        return { fullName, companyName, domains };
      });
    `);
    if (debug) {
      console.log(`[lusha] executeScript ${Date.now() - tScript}ms`);
    }

    const tMap = Date.now();
    const mapped = raw.map((record) => {
      const cleanedFullName = cleanName(record.fullName || "");
      const { firstName, lastName } = splitName(cleanedFullName);
      const domains = [];
      for (const text of record.domains || []) {
        const extracted = extractDomains(text);
        for (const d of extracted) {
          if (!domains.includes(d)) {
            domains.push(d);
          }
        }
      }
      return {
        fullName: cleanedFullName,
        firstName,
        lastName,
        companyName: record.companyName,
        website: domains.join(";"),
        domains,
      };
    });
    if (debug) {
      console.log(`[lusha] mapRecords ${Date.now() - tMap}ms`);
    }
    return mapped;
  };

  const lushaFrame = await getLushaFrame(driver);
  const tFrame = Date.now();
  const result = lushaFrame ? await withFrame(driver, lushaFrame, run) : await run();
  if (debug) {
    console.log(`[lusha] total ${Date.now() - t0}ms (frame=${lushaFrame ? "yes" : "no"}, switch=${Date.now() - tFrame}ms)`);
  }
  return result;
};

module.exports = {
  extractLushaContacts,
  splitName,
  extractDomains,
};
