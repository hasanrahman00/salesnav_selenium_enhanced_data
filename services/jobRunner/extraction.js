const { appendCsvRow } = require("../../utils/csvFile");
const { updateJob } = require("../jobStore");
const { extractLushaContacts } = require("../../automation/lusha/extract");
const { clickLushaMinimize, clickLushaBadge } = require("../../automation/lusha/actions");
const { clickContactoutBadge } = require("../../automation/contactout/actions");
const { extractContactoutData } = require("../../automation/contactout/extract");
const { extractSalesNavLeads } = require("../../automation/salesnav/extract");
const { humanScrollSalesDashboard } = require("../../automation/utils/salesDashBoardScroller");
const { getLeadListKey } = require("../../automation/utils/pagination");
const { By, waitForAnyVisible, waitForSalesNavReady } = require("../../automation/utils/dom");
const {
  ensureExtensionAuth,
  detectLushaLoginPanel,
  detectContactoutLoginPanel,
  attemptContactoutPanelLogin,
} = require("./auth");
const { toCsvRow } = require("./csv");

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const mergeLushaDomains = (records, lushaRecords) => {
  if (!Array.isArray(records) || !Array.isArray(lushaRecords)) {
    return records;
  }
  for (const lusha of lushaRecords) {
    const lushaFirst = normalizeKey(lusha.firstName || "");
    const lushaCompany = normalizeKey(lusha.companyName || "");
    const lushaDomains = Array.isArray(lusha.domains) ? lusha.domains : [];
    if (!lushaDomains.length) {
      continue;
    }
    for (const record of records) {
      if (!record) {
        continue;
      }
      const recordFirst = normalizeKey(record.firstName || "");
      const recordCompany = normalizeKey(record.companyName || "");
      const firstMatch = lushaFirst && recordFirst && lushaFirst === recordFirst;
      const companyMatch = lushaCompany && recordCompany && lushaCompany === recordCompany;
      if (!firstMatch && !companyMatch) {
        continue;
      }
      if (!record.domains || record.domains.length === 0) {
        record.domains = lushaDomains.slice(0, 2);
        record.website = record.domains.join(";");
      }
    }
  }
  return records;
};

const mergeContactoutDomains = (records, contactoutRecords) => {
  if (!Array.isArray(records) || !Array.isArray(contactoutRecords)) {
    return records;
  }

  for (const contactout of contactoutRecords) {
    const coFirstName = normalizeKey(contactout.firstName || "");
    const coCompany = normalizeKey(contactout.companyName || "");
    const coDomains = Array.isArray(contactout.domains) ? contactout.domains : [];
    if (!coDomains.length) {
      continue;
    }

    for (const record of records) {
      if (!record) {
        continue;
      }
      if (record.domains && record.domains.length) {
        continue;
      }
      const recordFirst = normalizeKey(record.firstName || "");
      const recordCompany = normalizeKey(record.companyName || "");
      const firstNameMatch = coFirstName && recordFirst && coFirstName === recordFirst;
      const companyMatch = coCompany && recordCompany && coCompany === recordCompany;
      if (!firstNameMatch && !companyMatch) {
        continue;
      }
      record.domains = coDomains.slice(0, 2);
      record.website = record.domains.join(";");
    }
  }
  return records;
};

const hasLushaContacts = async (driver, timeoutMs = 1500) => {
  const locators = [
    By.css("[data-test-id='bulk-contact-container-with-data']"),
    By.css(".bulk-contact-profile-container"),
  ];
  try {
    await waitForAnyVisible(driver, locators, timeoutMs);
    return true;
  } catch (error) {
    return false;
  }
};

const hasContactoutContacts = async (driver, timeoutMs = 1500) => {
  const locators = [By.css("[data-testid='contact-information']")];
  try {
    await waitForAnyVisible(driver, locators, timeoutMs);
    return true;
  } catch (error) {
    return false;
  }
};

const runPageExtraction = async ({
  driver,
  job,
  filePath,
  pageIndex,
  total,
  cookies,
  urlNumber,
}) => {
  const extractDelayMs = Number(process.env.EXTRACT_DELAY_MS || 200);
  const timings = {
    preExtractMs: 0,
    lushaExtractMs: 0,
    lushaMinimizeMs: 0,
    clickGapMs: 0,
    contactoutClickMs: 0,
    contactoutDelayMs: 0,
    contactoutExtractMs: 0,
    csvWriteMs: 0,
  };
  const flowStart = Date.now();
  if (extractDelayMs > 0 && driver) {
    const tPre = Date.now();
    await driver.sleep(extractDelayMs);
    timings.preExtractMs = Date.now() - tPre;
  }

  if (driver) {
    try {
      await waitForSalesNavReady(driver, Number(process.env.SALESNAV_READY_TIMEOUT_MS || 15000));
      await humanScrollSalesDashboard(driver, {
        minSteps: 1,
        maxSteps: 1,
        stepPx: Number(process.env.HUMAN_SCROLL_STEP_PX || 200),
        minDelayMs: Number(process.env.HUMAN_SCROLL_MIN_DELAY_MS || 200),
        maxDelayMs: Number(process.env.HUMAN_SCROLL_MAX_DELAY_MS || 550),
        timeoutMs: Number(process.env.HUMAN_SCROLL_TIMEOUT_MS || 15000),
        maxRounds: 1,
        bottomStallLimit: 1,
      });
      await clickLushaBadge(driver, Number(process.env.LUSHA_BADGE_TIMEOUT_MS || 8000));
    } catch (error) {
      // keep going; extraction will retry if container not visible
    }
  }

  const salesNavRecords = driver
    ? await extractSalesNavLeads(driver, {
        timeoutMs: Number(process.env.SALESNAV_EXTRACT_TIMEOUT_MS || 15000),
      })
    : [];
  const lushaStart = Date.now();
  const lushaRecords = driver
    ? await extractLushaContacts(driver, { maxCards: 25, debug: true, retryOnTimeout: true })
    : [];
  timings.lushaExtractMs = Date.now() - lushaStart;
  const lushaSeconds = (timings.lushaExtractMs / 1000).toFixed(2);
  updateJob(job.id, { lushaSeconds: Number(lushaSeconds) });

  const records = Array.isArray(salesNavRecords) ? [...salesNavRecords] : [];
  mergeLushaDomains(records, lushaRecords);

  let contactoutSeconds = 0;
  try {
    if (driver) {
      const lushaVisible = await hasLushaContacts(driver, 1200);
      if (!lushaVisible) {
        const lushaLogin = await detectLushaLoginPanel(driver, 1200);
        if (lushaLogin) {
          await ensureExtensionAuth(driver, cookies, "Lusha");
          await driver.navigate().refresh();
          await waitForSalesNavReady(driver).catch(() => null);
          await clickLushaBadge(driver, Number(process.env.LUSHA_BADGE_TIMEOUT_MS || 8000));
          const lushaVisibleRetry = await hasLushaContacts(driver, 2000);
          if (!lushaVisibleRetry) {
            throw new Error("Lusha contacts are not visible after re-auth.");
          }
        }
      }
      const tMin = Date.now();
      await clickLushaMinimize(driver, { timeoutMs: 1500, preferFrame: true });
      timings.lushaMinimizeMs = Date.now() - tMin;
      const clickGapMs = Number(process.env.CLICK_GAP_MS || 300);
      if (clickGapMs > 0) {
        const tGap = Date.now();
        await driver.sleep(clickGapMs);
        timings.clickGapMs = Date.now() - tGap;
      }
      const tClick = Date.now();
      await clickContactoutBadge(driver, {
        timeoutMs: Number(process.env.CONTACTOUT_CLICK_TIMEOUT_MS || 4000),
        skipReadyWait: true,
        perFrameWaitMs: Number(process.env.CONTACTOUT_FRAME_WAIT_MS || 250),
        mainDocWaitMs: Number(process.env.CONTACTOUT_MAIN_WAIT_MS || 600),
        postMinimizeDelayMs: Number(process.env.CONTACTOUT_MINIMIZE_DELAY_MS || 150),
        maxFrames: Number(process.env.CONTACTOUT_MAX_FRAMES || 6),
      });
      const contactoutVisible = await hasContactoutContacts(driver, 1200);
      if (!contactoutVisible) {
        const contactoutLogin = await detectContactoutLoginPanel(driver, 1200);
        if (contactoutLogin) {
          const panelLogin = await attemptContactoutPanelLogin(driver);
          if (!panelLogin.ok) {
            await ensureExtensionAuth(driver, cookies, "ContactOut");
          }
          await driver.navigate().refresh();
          await waitForSalesNavReady(driver).catch(() => null);
          await clickContactoutBadge(driver, {
            timeoutMs: Number(process.env.CONTACTOUT_CLICK_TIMEOUT_MS || 4000),
            skipReadyWait: true,
            perFrameWaitMs: Number(process.env.CONTACTOUT_FRAME_WAIT_MS || 250),
            mainDocWaitMs: Number(process.env.CONTACTOUT_MAIN_WAIT_MS || 600),
            postMinimizeDelayMs: Number(process.env.CONTACTOUT_MINIMIZE_DELAY_MS || 150),
            maxFrames: Number(process.env.CONTACTOUT_MAX_FRAMES || 6),
          });
          const contactoutVisibleRetry = await hasContactoutContacts(driver, 2000);
          if (!contactoutVisibleRetry) {
            throw new Error("ContactOut contacts are not visible after re-auth.");
          }
        }
      }
      timings.contactoutClickMs = Date.now() - tClick;
      const contactoutDelayMs = Number(process.env.CONTACTOUT_DELAY_MS || 200);
      if (contactoutDelayMs > 0) {
        const tDelay = Date.now();
        await driver.sleep(contactoutDelayMs);
        timings.contactoutDelayMs = Date.now() - tDelay;
      }
      const expectedLeadKey = await getLeadListKey(driver).catch(() => null);
      const contactoutStart = Date.now();
      const contactoutData = await extractContactoutData(driver, {
        timeoutMs: Number(process.env.CONTACTOUT_TIMEOUT_MS || 10000),
        debug: true,
        minResults: 1,
        retryDelayMs: Number(process.env.CONTACTOUT_RETRY_DELAY_MS || 800),
        maxRetries: Number(process.env.CONTACTOUT_MAX_RETRIES || 2),
        expectedLeadKey,
      }).catch(() => []);
      timings.contactoutExtractMs = Date.now() - contactoutStart;
      contactoutSeconds = Number((timings.contactoutExtractMs / 1000).toFixed(2));
      mergeContactoutDomains(records, contactoutData);
    }
  } catch (error) {
    if (error && error.code === "AUTH_EXPIRED") {
      throw error;
    }
    // keep extraction result even if ContactOut click fails
  }

  let added = 0;
  const tCsv = Date.now();
  for (const record of records) {
    record.urlNumber = urlNumber ?? 1;
    record.pageNumber = pageIndex;
    appendCsvRow(filePath, toCsvRow(record));
    added += 1;
  }
  timings.csvWriteMs = Date.now() - tCsv;

  const extractSeconds = Number((Number(lushaSeconds) + contactoutSeconds).toFixed(2));
  const flowSeconds = Number(((Date.now() - flowStart) / 1000).toFixed(2));
  const nextTotal = (total || 0) + added;
  updateJob(job.id, {
    lushaSeconds: Number(lushaSeconds),
    contactoutSeconds,
    extractSeconds,
    totalSeconds: flowSeconds,
    total: nextTotal,
    pageIndex,
    urlNumber: urlNumber ?? 1,
  });
  console.log(
    `[timing][page:${pageIndex}] preExtract=${timings.preExtractMs}ms lushaExtract=${timings.lushaExtractMs}ms lushaMin=${timings.lushaMinimizeMs}ms clickGap=${timings.clickGapMs}ms contactoutClick=${timings.contactoutClickMs}ms contactoutDelay=${timings.contactoutDelayMs}ms contactoutExtract=${timings.contactoutExtractMs}ms total=${Math.round(flowSeconds * 1000)}ms`
  );
  console.log(`[timing][page:${pageIndex}] csvWrite=${timings.csvWriteMs}ms rows=${added}`);
  return { added, total: nextTotal };
};

module.exports = {
  runPageExtraction,
};
