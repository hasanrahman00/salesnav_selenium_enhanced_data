const freeEmailDomains = require("free-email-domains");
const { By, waitForAnyVisible } = require("../utils/dom");

const withFrame = async (driver, frameEl, fn) => {
  await driver.switchTo().frame(frameEl);
  try {
    return await fn();
  } finally {
    await driver.switchTo().defaultContent();
  }
};

const getContactoutFrame = async (driver) => {
  const frames = await driver.findElements(By.css("iframe"));
  for (const frame of frames) {
    try {
      const src = await frame.getAttribute("src");
      const id = await frame.getAttribute("id");
      if ((src && src.includes("contactout")) || id === "contactout-iframe") {
        return frame;
      }
    } catch (error) {
      // ignore
    }
  }
  return null;
};

const extractDomainsFromText = (text) => {
  if (!text) {
    return [];
  }
  const matches = String(text).match(/@([a-z0-9.-]+\.[a-z]{2,})/gi) || [];
  const domains = matches.map((m) => m.replace(/^@/, "").toLowerCase());
  const filtered = domains.filter((domain) => !freeEmailDomains.includes(domain));
  return Array.from(new Set(filtered));
};

const extractContactoutData = async (
  driver,
  {
    timeoutMs = 30000,
    debug = true,
    minResults = 1,
    retryDelayMs = 800,
    maxRetries = 2,
    expectedLeadKey = null,
  } = {}
) => {
  const t0 = Date.now();
  if (debug) {
    console.log(`[contactout] start (timeout=${timeoutMs}ms)`);
  }
  const run = async () => {
    const tVisible = Date.now();
    await waitForAnyVisible(
      driver,
      [By.css("[data-testid='contact-information']")],
      timeoutMs
    );
    if (debug) {
      console.log(`[contactout] waitForAnyVisible ${Date.now() - tVisible}ms`);
    }

    const tScript = Date.now();
    const raw = await driver.executeScript(`
      const containers = Array.from(document.querySelectorAll('[data-testid="contact-information"]'));
      return containers.map((container) => {
        const nameEl = container.querySelector('.css-72nh78');
        const titleEl = container.querySelector('.css-oq7ggv');
        const fullName = nameEl ? nameEl.textContent.trim() : '';
        const titleText = titleEl ? titleEl.textContent.trim() : '';
        const spans = Array.from(container.querySelectorAll('[data-testid="contact-row-container"] span'));
        const emails = spans.map((span) => (span.textContent || '').trim()).filter(Boolean);
        return { fullName, titleText, emails };
      });
    `);
    if (debug) {
      console.log(`[contactout] executeScript ${Date.now() - tScript}ms`);
    }

    const tMap = Date.now();
    const mapped = raw.map((record) => {
      const titleText = String(record.titleText || "").trim();
      const atMatch = titleText.match(/\s+at\s+/i);
      let title = titleText;
      let companyName = "";
      if (atMatch && atMatch.index !== undefined) {
        title = titleText.slice(0, atMatch.index).trim();
        companyName = titleText.slice(atMatch.index + atMatch[0].length).trim();
      }
      const domains = [];
      for (const emailText of record.emails || []) {
        const extracted = extractDomainsFromText(emailText);
        for (const d of extracted) {
          if (!domains.includes(d)) {
            domains.push(d);
          }
        }
      }
      return {
        fullName: record.fullName,
        title,
        companyName,
        domains: domains.slice(0, 2),
      };
    });
    if (debug) {
      console.log(`[contactout] mapRecords ${Date.now() - tMap}ms`);
    }
    return mapped;
  };

  const normalizeKey = (value) => String(value || "").toLowerCase();
  const executeWithRetry = async (fn, frameLabel) => {
    let attempt = 0;
    let result = await fn();
    const hasData = (list) =>
      Array.isArray(list) &&
      list.length >= minResults &&
      list.some((item) => (item.fullName || '').trim() || (item.domains || []).length);
    const matchesExpected = (list) => {
      if (!expectedLeadKey) {
        return true;
      }
      if (!Array.isArray(list) || !list.length) {
        return false;
      }
      const first = list[0];
      const name = normalizeKey(first.fullName || "");
      const key = normalizeKey(expectedLeadKey);
      return Boolean(name) && key.includes(name.split(" ")[0]);
    };
    while ((!hasData(result) || !matchesExpected(result)) && attempt < maxRetries) {
      attempt += 1;
      if (debug) {
        console.log(`[contactout] retry ${attempt} (no data or mismatch)`);
      }
      await driver.sleep(retryDelayMs);
      result = await fn();
    }
    if (debug) {
      console.log(`[contactout] total ${Date.now() - t0}ms (frame=${frameLabel})`);
    }
    return result;
  };

  const frame = await getContactoutFrame(driver);
  if (frame) {
    const tFrame = Date.now();
    const result = await executeWithRetry(() => withFrame(driver, frame, run), "yes");
    if (debug) {
      console.log(`[contactout] switch=${Date.now() - tFrame}ms`);
    }
    return result;
  }

  const frames = await driver.findElements(By.css("iframe"));
  for (const candidate of frames) {
    try {
      const tFrame = Date.now();
      const result = await executeWithRetry(() => withFrame(driver, candidate, run), "scan");
      if (Array.isArray(result) && result.length) {
        if (debug) {
          console.log(`[contactout] switch=${Date.now() - tFrame}ms`);
        }
        return result;
      }
    } catch (error) {
      // ignore and continue
    }
  }

  return executeWithRetry(run, "no");
};

module.exports = {
  extractContactoutData,
};
