const { waitForSalesNavReady } = require("../automation/utils/dom");
const { ensureCsvHeader } = require("../utils/csvFile");
const { createJob, updateJob, getJob } = require("./jobStore");
const { startScraper, stopScraper } = require("./scraperSession");
const { csvHeader, createCsvPath, runPaginatedExtraction } = require("./jobRunner");

const sessions = new Map();

const getResumeStartPage = (job, entry) => {
  if (!job || !entry) {
    return 1;
  }
  const sameUrl = String(job.listUrl || "") === String(entry.url || "");
  const sameNumber = String(job.urlNumber || "") === String(entry.urlNumber || "");
  if (sameUrl && sameNumber && Number.isFinite(job.pageIndex)) {
    return Number(job.pageIndex) + 1;
  }
  return 1;
};

const startBulkJob = async ({ listName, bulkUrls }) => {
  if (!Array.isArray(bulkUrls) || bulkUrls.length === 0) {
    throw new Error("Bulk URLs are missing");
  }
  const filePath = createCsvPath(listName);
  ensureCsvHeader(filePath, csvHeader);
  const firstUrl = bulkUrls[0]?.url || "";
  const job = createJob({ listName, listUrl: firstUrl, filePath });
  updateJob(job.id, { status: "Running", error: null });
  updateJob(job.id, {
    bulk: true,
    bulkUrls,
    bulkIndex: 0,
    bulkTotal: bulkUrls.length,
    urlNumber: bulkUrls[0]?.urlNumber || 1,
  });
  let session;
  try {
    session = await startScraper(job);
    sessions.set(job.id, session);
  } catch (error) {
    updateJob(job.id, { status: "Failed", error: String(error.message || error) });
    throw error;
  }
  const driver = session?.driver;
  let total = 0;
  for (let i = 0; i < bulkUrls.length; i += 1) {
    const current = getJob(job.id);
    if (!current || current.status === "Stopped") {
      break;
    }
    const entry = bulkUrls[i];
    updateJob(job.id, {
      listUrl: entry.url,
      bulkIndex: i,
      urlNumber: entry.urlNumber,
      pageIndex: 0,
    });
    if (driver) {
      await driver.get(entry.url);
      await waitForSalesNavReady(driver).catch(() => null);
    }
    const result = await runPaginatedExtraction({
      driver,
      job: getJob(job.id) || job,
      filePath,
      initialTotal: total,
      cookies: session?.cookies,
      urlNumber: entry.urlNumber,
      startPageIndex: 1,
    });
    total = result.total;
    updateJob(job.id, { total });
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
    updateJob(job.id, { bulkIndex: i + 1 });
  }
  const keepBrowser = String(process.env.KEEP_BROWSER_AFTER_JOB || "true").toLowerCase() === "true";
  if (!keepBrowser && session) {
    await stopScraper(session);
    sessions.delete(job.id);
  }
  return updateJob(job.id, { status: "Completed" });
};

const resumeBulkJob = async (id) => {
  const job = getJob(id);
  if (!job) {
    return null;
  }
  if (job.status === "Running") {
    return job;
  }
  updateJob(job.id, { status: "Running", error: null });
  const bulkUrls = Array.isArray(job.bulkUrls) ? job.bulkUrls : [];
  if (bulkUrls.length === 0) {
    return updateJob(job.id, { status: "Failed", error: "Bulk URLs are missing" });
  }
  ensureCsvHeader(job.filePath, csvHeader);
  let session;
  try {
    session = await startScraper(job);
    sessions.set(job.id, session);
  } catch (error) {
    updateJob(job.id, { status: "Failed", error: String(error.message || error) });
    throw error;
  }
  const driver = session?.driver;
  let total = job.total || 0;
  const startIndex = Number.isFinite(job.bulkIndex) ? job.bulkIndex : 0;
  for (let i = startIndex; i < bulkUrls.length; i += 1) {
    const current = getJob(job.id);
    if (!current || current.status === "Stopped") {
      break;
    }
    const entry = bulkUrls[i];
    const startPageIndex = getResumeStartPage(current, entry);
    updateJob(job.id, {
      listUrl: entry.url,
      bulkIndex: i,
      urlNumber: entry.urlNumber,
      pageIndex: startPageIndex > 1 ? startPageIndex - 1 : 0,
    });
    if (driver) {
      await driver.get(entry.url);
      await waitForSalesNavReady(driver).catch(() => null);
    }
    const result = await runPaginatedExtraction({
      driver,
      job: getJob(job.id) || job,
      filePath: job.filePath,
      initialTotal: total,
      cookies: session?.cookies,
      urlNumber: entry.urlNumber,
      startPageIndex,
    });
    total = result.total;
    updateJob(job.id, { total });
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
    updateJob(job.id, { bulkIndex: i + 1 });
  }
  const keepBrowser = String(process.env.KEEP_BROWSER_AFTER_JOB || "true").toLowerCase() === "true";
  if (!keepBrowser && session) {
    await stopScraper(session);
    sessions.delete(job.id);
  }
  return updateJob(job.id, { status: "Completed" });
};

const stopBulkJob = async (id) => {
  const job = getJob(id);
  if (!job) {
    return null;
  }
  if (sessions.has(id)) {
    await stopScraper(sessions.get(id));
    sessions.delete(id);
  }
  return updateJob(id, { status: "Paused" });
};

module.exports = {
  startBulkJob,
  resumeBulkJob,
  stopBulkJob,
};
