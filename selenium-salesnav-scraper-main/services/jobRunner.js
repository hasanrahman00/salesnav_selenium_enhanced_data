const fs = require("fs");
const path = require("path");
const { ensureCsvHeader, appendCsvRow } = require("../utils/csvFile");
const { dataDir } = require("../config/paths");
const { createJob, updateJob, getJob } = require("./jobStore");
const { startScraper, stopScraper } = require("./scraperSession");
const { extractLushaContacts } = require("../automation/lusha/extract");
const { clickLushaMinimize, clickLushaBadge } = require("../automation/lusha/actions");
const { clickContactoutBadge } = require("../automation/contactout/actions");
const { extractContactoutData } = require("../automation/contactout/extract");
const { humanScrollSalesDashboard } = require("../automation/utils/salesDashBoardScroller");
const { clickNextPage, getPageInfo, getLeadListKey, setPageParam } = require("../automation/utils/pagination");
const { By, waitForAnyVisible, waitForSalesNavReady } = require("../automation/utils/dom");
const { confirmLoginInNewTab, isLoginPage } = require("./scraper/auth");

const intervals = new Map();
const sessions = new Map();

const isJobStopped = (id) => {
  const current = getJob(id);
  if (!current) {
    return true;
  }
  const status = String(current.status || "").toLowerCase();
  return status === "stopped" || status === "paused";
};

const normalizeName = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const createCsvPath = (listName) => {
  const safe = normalizeName(listName || "job");
  const stamp = Date.now();
  return path.join(dataDir, `${safe}-${stamp}.csv`);
};

const csvHeader =
  "Url Number,Page Number,Full Name,First Name,Last Name,Company Name,Title,Website,Website_one";

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  if (text.includes("\"") || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
};

const toCsvRow = (record) => {
  const domains = Array.isArray(record.domains) ? record.domains : [];
  return [
    escapeCsvValue(record.urlNumber ?? ""),
    escapeCsvValue(record.pageNumber ?? ""),
    escapeCsvValue(record.fullName),
    escapeCsvValue(record.firstName),
    escapeCsvValue(record.lastName),
    escapeCsvValue(record.companyName),
    escapeCsvValue(record.title || ""),
    escapeCsvValue(domains[0] || ""),
    escapeCsvValue(domains[1] || ""),
  ].join(",");
};

const mergeContactoutData = (records, contactoutRecords) => {
  if (!Array.isArray(records) || !Array.isArray(contactoutRecords)) {
    return records;
  }

  for (const contactout of contactoutRecords) {
    const coFirstName = String(contactout.fullName || "").split(/\s+/)[0]?.toLowerCase();
    const coDomains = Array.isArray(contactout.domains) ? contactout.domains : [];

    for (const record of records) {
      if (!record) {
        continue;
      }
      const firstNameMatch =
        coFirstName && record.firstName && record.firstName.toLowerCase() === coFirstName;
      const companyMatch =
        contactout.companyName &&
        record.companyName &&
        record.companyName.toLowerCase() === contactout.companyName.toLowerCase();

      if (firstNameMatch || companyMatch) {
        if (!record.title && contactout.title) {
          record.title = contactout.title;
        }
        if (!record.companyName && contactout.companyName) {
          record.companyName = contactout.companyName;
        }
        if ((!record.domains || record.domains.length === 0) && coDomains.length) {
          record.domains = [...coDomains];
          record.website = coDomains.join(";");
        }
      }
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

const createAuthError = (name, message) => {
  const error = new Error(`${name} cookie expired. ${message}`);
  error.code = "AUTH_EXPIRED";
  error.site = name;
  return error;
};

const ensureExtensionAuth = async (driver, cookies, name) => {
  if (!cookies) {
    throw createAuthError(name, "cookies are missing.");
  }
  if (name === "Lusha") {
    const lushaCheck = await confirmLoginInNewTab({
      driver,
      name: "Lusha",
      baseUrl: "https://dashboard.lusha.com",
      confirmUrl: "https://dashboard.lusha.com/dashboard",
      cookies: cookies.lusha,
    });
    if (!lushaCheck.ok) {
      throw createAuthError("Lusha", lushaCheck.message);
    }
    return;
  }
  const contactoutCheck = await confirmLoginInNewTab({
    driver,
    name: "ContactOut",
    baseUrl: "https://contactout.com",
    confirmUrl: "https://contactout.com/lists",
    cookies: cookies.contactout,
  });
  if (!contactoutCheck.ok) {
    throw createAuthError("ContactOut", contactoutCheck.message);
  }
};

const detectLushaLoginPanel = async (driver, timeoutMs = 1200) => {
  const frames = await driver.findElements(By.css("iframe"));
  for (const frame of frames) {
    try {
      const id = await frame.getAttribute("id");
      if (id && id !== "LU__extension_iframe") {
        continue;
      }
      await driver.switchTo().frame(frame);
      const found = await driver.executeScript(`
        const root = document.querySelector('#root');
        const loginBtn = document.querySelector('.login-btn, .lusha-login button');
        const loginText = document.querySelector('.lusha-login');
        return Boolean(root && (loginBtn || loginText));
      `);
      await driver.switchTo().defaultContent();
      if (found) {
        return true;
      }
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

const detectContactoutLoginPanel = async (driver, timeoutMs = 1200) => {
  const frames = await driver.findElements(By.css("iframe"));
  for (const frame of frames) {
    try {
      await driver.switchTo().frame(frame);
      const found = await driver.executeScript(`
        const root = document.querySelector('#root');
        const loginBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          /login|sign up/i.test((b.textContent || ''))
        );
        const headerLogo = document.querySelector('[data-testid="header-logo"]');
        const signupTitle = Array.from(document.querySelectorAll('h1')).some((h) =>
          /sign up/i.test(h.textContent || '')
        );
        return Boolean(root && (loginBtn || signupTitle) && headerLogo);
      `);
      await driver.switchTo().defaultContent();
      if (found) {
        return true;
      }
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

const clickContactoutLoginButton = async (driver, timeoutMs = 1200) => {
  const frames = await driver.findElements(By.css("iframe"));
  for (const frame of frames) {
    try {
      await driver.switchTo().frame(frame);
      const clicked = await driver.executeScript(`
        const root = document.querySelector('#root');
        const loginBtn = Array.from(document.querySelectorAll('button')).find((b) =>
          /login/i.test((b.textContent || ''))
        );
        if (root && loginBtn) {
          loginBtn.click();
          return true;
        }
        return false;
      `);
      await driver.switchTo().defaultContent();
      if (clicked) {
        return true;
      }
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

const waitForNewTab = async (driver, existingHandles, timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handles = await driver.getAllWindowHandles();
    const newHandle = handles.find((handle) => !existingHandles.includes(handle));
    if (newHandle) {
      return newHandle;
    }
    await driver.sleep(250);
  }
  return null;
};

const confirmContactoutDashboardTab = async (driver, handle, timeoutMs = 6000) => {
  try {
    await driver.switchTo().window(handle);
    const loadGapMs = Number(process.env.CONTACTOUT_LOGIN_TAB_GAP_MS || 1200);
    if (loadGapMs > 0) {
      await driver.sleep(loadGapMs);
    }
    const currentUrl = await driver.getCurrentUrl();
    const title = await driver.getTitle().catch(() => "");
    if (isLoginPage(currentUrl, title)) {
      return { ok: false, message: "Redirected to login page." };
    }
    const normalized = String(currentUrl || "").toLowerCase();
    const onContactout = normalized.includes("contactout.com");
    const onDashboard = normalized.includes("/lists") || normalized.includes("/dashboard");
    if (!onContactout) {
      return { ok: false, message: "Unexpected login tab URL." };
    }
    return { ok: true, dashboard: onDashboard };
  } catch (error) {
    return { ok: false, message: error.message || String(error) };
  }
};

const attemptContactoutPanelLogin = async (driver) => {
  const original = await driver.getWindowHandle();
  const existingHandles = await driver.getAllWindowHandles();
  const clicked = await clickContactoutLoginButton(driver);
  if (!clicked) {
    return { ok: false, clicked: false, message: "Login button not found." };
  }
  const newTab = await waitForNewTab(driver, existingHandles, Number(process.env.CONTACTOUT_LOGIN_TAB_WAIT_MS || 9000));
  if (!newTab) {
    return { ok: false, clicked: true, message: "Login tab did not open." };
  }
  const result = await confirmContactoutDashboardTab(driver, newTab);
  try {
    await driver.close();
  } catch (error) {
    // ignore
  }
  try {
    await driver.switchTo().window(original);
  } catch (error) {
    // ignore
  }
  return result;
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
      await clickLushaBadge(driver, Number(process.env.LUSHA_BADGE_TIMEOUT_MS || 8000));
    } catch (error) {
      // keep going; extraction will retry if container not visible
    }
  }
  const lushaStart = Date.now();
  const records = driver
    ? await extractLushaContacts(driver, { maxCards: 25, debug: true, retryOnTimeout: true })
    : [];
  timings.lushaExtractMs = Date.now() - lushaStart;
  const lushaSeconds = (timings.lushaExtractMs / 1000).toFixed(2);
  updateJob(job.id, { lushaSeconds: Number(lushaSeconds) });

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
      mergeContactoutData(records, contactoutData);
      await humanScrollSalesDashboard(driver, {
        minSteps: Number(process.env.HUMAN_SCROLL_MIN_STEPS || 7),
        maxSteps: Number(process.env.HUMAN_SCROLL_MAX_STEPS || 10),
        stepPx: Number(process.env.HUMAN_SCROLL_STEP_PX || 200),
        minDelayMs: Number(process.env.HUMAN_SCROLL_MIN_DELAY_MS || 200),
        maxDelayMs: Number(process.env.HUMAN_SCROLL_MAX_DELAY_MS || 550),
        timeoutMs: Number(process.env.HUMAN_SCROLL_TIMEOUT_MS || 15000),
        maxRounds: Number(process.env.HUMAN_SCROLL_MAX_ROUNDS || 20),
        bottomStallLimit: Number(process.env.HUMAN_SCROLL_BOTTOM_STALL_LIMIT || 4),
      });
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

const runPaginatedExtraction = async ({
  driver,
  job,
  filePath,
  initialTotal,
  cookies,
  urlNumber,
  startPageIndex,
}) => {
  let total = initialTotal || 0;
  const resolvedStart = Number.isFinite(Number(startPageIndex)) && Number(startPageIndex) > 1
    ? Number(startPageIndex)
    : 1;
  let pageIndex = resolvedStart;
  const maxPagesEnv = process.env.MAX_PAGES;
  const maxPages = Number.isFinite(Number(maxPagesEnv)) ? Number(maxPagesEnv) : 100;
  let lastPageNumber = null;
  if (driver) {
    const info = await getPageInfo(driver).catch(() => null);
    lastPageNumber = info?.pageNumber ?? null;
  }
  if (driver && resolvedStart > 1) {
    if (isJobStopped(job.id)) {
      return { total, failed: false, stopped: true };
    }
    const seedUrl = job?.listUrl || (await driver.getCurrentUrl().catch(() => null));
    const targetUrl = setPageParam(seedUrl, resolvedStart);
    if (targetUrl) {
      await driver.get(targetUrl);
    }
    await waitForSalesNavReady(driver, Number(process.env.NEXT_PAGE_TIMEOUT_MS || 15000)).catch(() => null);
    const info = await getPageInfo(driver).catch(() => null);
    lastPageNumber = info?.pageNumber ?? lastPageNumber;
  }
  for (let i = 0; i < maxPages; i += 1) {
    if (isJobStopped(job.id)) {
      return { total, failed: false, stopped: true };
    }
    let result;
    try {
      result = await runPageExtraction({
        driver,
        job,
        filePath,
        pageIndex,
        total,
        cookies,
        urlNumber,
      });
    } catch (error) {
      if (isJobStopped(job.id)) {
        if (driver) {
          await driver.quit().catch(() => {});
        }
        return { total, failed: false, stopped: true };
      }
      const message = String(error.message || error);
      updateJob(job.id, { status: "Failed", error: message });
      if (driver) {
        await driver.quit().catch(() => {});
      }
      return { total, failed: true, error: message };
    }
    total = result.total;
    if (!driver) {
      break;
    }
    if (isJobStopped(job.id)) {
      return { total, failed: false, stopped: true };
    }
    console.log(`[pagination] page ${pageIndex} done, moving next...`);
    const expectedNext = lastPageNumber ? lastPageNumber + 1 : null;
    let next;
    try {
      next = await clickNextPage(driver, {
        timeoutMs: Number(process.env.NEXT_PAGE_TIMEOUT_MS || 15000),
        expectedNext,
      });
    } catch (error) {
      if (isJobStopped(job.id)) {
        return { total, failed: false, stopped: true };
      }
      const errorMessage = `Pagination failed: ${error.message || error}`;
      updateJob(job.id, { status: "Failed", error: errorMessage });
      return { total, failed: true, error: errorMessage };
    }
    if (!next.moved) {
      if (isJobStopped(job.id)) {
        return { total, failed: false, stopped: true };
      }
      const reason = next.reason || "no-move";
      if (reason === "disabled") {
        console.log("[pagination] reached last page");
        break;
      }
      const errorMessage = `Pagination stopped: ${reason}`;
      updateJob(job.id, { status: "Failed", error: errorMessage });
      return { total, failed: true, error: errorMessage };
    }
    if (next.pageNumber && lastPageNumber && next.pageNumber !== lastPageNumber + 1) {
      if (isJobStopped(job.id)) {
        return { total, failed: false, stopped: true };
      }
      console.log(`[pagination] page mismatch: expected ${lastPageNumber + 1}, got ${next.pageNumber}`);
      const errorMessage = `Pagination page mismatch: expected ${lastPageNumber + 1}, got ${next.pageNumber}`;
      updateJob(job.id, { status: "Failed", error: errorMessage });
      return { total, failed: true, error: errorMessage };
    }
    lastPageNumber = next.pageNumber || lastPageNumber;
    pageIndex += 1;
  }
  if (maxPagesEnv && pageIndex > maxPages) {
    console.log(`[pagination] stopped at MAX_PAGES=${maxPages}`);
  }
  return { total, failed: false };
};

const startJob = async ({ listName, listUrl }) => {
  const filePath = createCsvPath(listName);
  ensureCsvHeader(filePath, csvHeader);
  const job = createJob({ listName, listUrl, filePath });
  updateJob(job.id, { status: "Running", error: null });
  try {
    const session = await startScraper(job);
    sessions.set(job.id, session);
  } catch (error) {
    updateJob(job.id, { status: "Failed", error: String(error.message || error) });
    throw error;
  }
  const session = sessions.get(job.id);
  const driver = session?.driver;
  const result = await runPaginatedExtraction({
    driver,
    job,
    filePath,
    initialTotal: 0,
    cookies: session?.cookies,
    urlNumber: 1,
    startPageIndex: 1,
  });
  updateJob(job.id, { total: result.total });
  if (result.stopped) {
    if (session) {
      await stopScraper(session).catch(() => {});
      sessions.delete(job.id);
    }
    return getJob(job.id);
  }
  if (result.failed) {
    return updateJob(job.id, { status: "Failed", error: result.error || "Pagination failed" });
  }
  const keepBrowser = String(process.env.KEEP_BROWSER_AFTER_JOB || "true").toLowerCase() === "true";
  if (!keepBrowser && session) {
    await stopScraper(session);
    sessions.delete(job.id);
  }
  return updateJob(job.id, { status: "Completed" });
};

const resumeJob = async (id) => {
  const job = getJob(id);
  if (!job) {
    return null;
  }
  if (job.status === "Running") {
    return job;
  }
  updateJob(job.id, { status: "Running", error: null });
  ensureCsvHeader(job.filePath, csvHeader);
  try {
    const session = await startScraper(job);
    sessions.set(job.id, session);
  } catch (error) {
    updateJob(job.id, { status: "Failed", error: String(error.message || error) });
    throw error;
  }
  const session = sessions.get(job.id);
  const driver = session?.driver;
  const result = await runPaginatedExtraction({
    driver,
    job,
    filePath: job.filePath,
    initialTotal: job.total || 0,
    cookies: session?.cookies,
    urlNumber: 1,
    startPageIndex: Number.isFinite(job.pageIndex) ? Number(job.pageIndex) + 1 : 1,
  });
  updateJob(job.id, { total: result.total });
  if (result.stopped) {
    if (session) {
      await stopScraper(session).catch(() => {});
      sessions.delete(job.id);
    }
    return getJob(job.id);
  }
  if (result.failed) {
    return updateJob(job.id, { status: "Failed", error: result.error || "Pagination failed" });
  }
  const keepBrowser = String(process.env.KEEP_BROWSER_AFTER_JOB || "true").toLowerCase() === "true";
  if (!keepBrowser && session) {
    await stopScraper(session);
    sessions.delete(job.id);
  }
  return updateJob(job.id, { status: "Completed" });
};

const stopJob = async (id) => {
  const job = getJob(id);
  if (!job) {
    return null;
  }
  if (intervals.has(id)) {
    clearInterval(intervals.get(id));
    intervals.delete(id);
  }
  if (sessions.has(id)) {
    await stopScraper(sessions.get(id));
    sessions.delete(id);
  }
  return updateJob(id, { status: "Paused" });
};

const completeJob = (id) => {
  const job = getJob(id);
  if (!job) {
    return null;
  }
  if (intervals.has(id)) {
    clearInterval(intervals.get(id));
    intervals.delete(id);
  }
  return updateJob(id, { status: "Completed" });
};

const failJob = (id, error) => {
  const job = getJob(id);
  if (!job) {
    return null;
  }
  if (intervals.has(id)) {
    clearInterval(intervals.get(id));
    intervals.delete(id);
  }
  return updateJob(id, { status: "Failed", error });
};

const deleteJobFile = (job) => {
  if (!job) {
    return;
  }
  if (job.filePath && fs.existsSync(job.filePath)) {
    fs.unlinkSync(job.filePath);
  }
};

module.exports = {
  csvHeader,
  createCsvPath,
  runPaginatedExtraction,
  startJob,
  resumeJob,
  stopJob,
  completeJob,
  failJob,
  deleteJobFile,
};
