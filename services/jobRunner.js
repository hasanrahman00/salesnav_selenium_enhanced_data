const fs = require("fs");
const { ensureCsvHeader } = require("../utils/csvFile");
const { createJob, updateJob, getJob } = require("./jobStore");
const { startScraper, stopScraper } = require("./scraperSession");
const { csvHeader, createCsvPath } = require("./jobRunner/csv");
const { runPaginatedExtraction } = require("./jobRunner/pagination");

const intervals = new Map();
const sessions = new Map();


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
