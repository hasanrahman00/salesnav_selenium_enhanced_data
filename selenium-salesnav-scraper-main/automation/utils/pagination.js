const { By, until, waitForAnyVisible, waitForSalesNavReady } = require("./dom");

const getPageInfo = async (driver) => {
  return driver.executeScript(`
    const url = window.location.href;
    let pageNumber = null;
    try {
      const u = new URL(url);
      const p = u.searchParams.get('page');
      if (p) {
        const n = Number(p);
        pageNumber = Number.isFinite(n) ? n : null;
      }
    } catch (e) {
      // ignore
    }
    if (!pageNumber) {
      const active = document.querySelector('[aria-current="true"]')
        || document.querySelector('.artdeco-pagination__indicator--number.active')
        || document.querySelector('li.artdeco-pagination__indicator--number.active');
      if (active) {
        const text = (active.textContent || '').trim();
        const m = text.match(/\d+/);
        if (m) {
          pageNumber = Number(m[0]);
        }
      }
    }
    return { url, pageNumber };
  `);
};

const getLeadListKey = async (driver) => {
  return driver.executeScript(`
    const selectors = [
      'a[data-control-name^="view_lead_panel"]',
      'div.search-results__result-item a',
      'li.search-results__result-item a',
      'a[data-test-search-result-link]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || '').trim();
        const href = el.getAttribute('href') || '';
        if (text || href) {
          return text + '||' + href;
        }
      }
    }
    return null;
  `);
};

const setPageParam = (url, pageNumber) => {
  if (!url) {
    return null;
  }
  try {
    const target = new URL(url);
    target.searchParams.set("page", String(pageNumber));
    return target.toString();
  } catch (error) {
    return null;
  }
};

const clickNextPage = async (driver, { timeoutMs = 15000, expectedNext = null } = {}) => {
  await waitForSalesNavReady(driver, timeoutMs);
  const nextLocators = [
    By.css("button[aria-label='Next'].artdeco-pagination__button--next"),
    By.css("button.artdeco-pagination__button--next"),
    By.xpath("//button[@aria-label='Next']"),
  ];
  const nextBtn = await waitForAnyVisible(driver, nextLocators, timeoutMs);
  const disabled = await nextBtn.getAttribute("disabled");
  const ariaDisabled = await nextBtn.getAttribute("aria-disabled");
  if (disabled !== null || String(ariaDisabled).toLowerCase() === "true") {
    return { moved: false, reason: "disabled" };
  }
  const before = await getPageInfo(driver);
  const beforeLeadKey = await getLeadListKey(driver).catch(() => null);
  try {
    await nextBtn.click();
  } catch (error) {
    await driver.executeScript("arguments[0].click();", nextBtn);
  }
  try {
    await driver.wait(async () => {
      const after = await getPageInfo(driver);
      return after.url !== before.url || after.pageNumber !== before.pageNumber;
    }, timeoutMs);
  } catch (error) {
    return { moved: false, reason: "page-change-timeout" };
  }
  if (beforeLeadKey) {
    try {
      await driver.wait(async () => {
        const key = await getLeadListKey(driver);
        return key && key !== beforeLeadKey;
      }, timeoutMs);
    } catch (error) {
      return { moved: false, reason: "leadlist-timeout" };
    }
  }
  await waitForSalesNavReady(driver, timeoutMs);
  const after = await getPageInfo(driver);
  if (expectedNext && after.pageNumber && after.pageNumber !== expectedNext) {
    return { moved: false, reason: "page-mismatch", pageNumber: after.pageNumber };
  }
  return { moved: true, pageNumber: after.pageNumber };
};

module.exports = {
  getPageInfo,
  getLeadListKey,
  clickNextPage,
  setPageParam,
};
