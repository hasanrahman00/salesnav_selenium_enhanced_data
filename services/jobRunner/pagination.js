const { clickNextPage, getPageInfo, setPageParam } = require("../../automation/utils/pagination");
const { waitForSalesNavReady } = require("../../automation/utils/dom");
const { updateJob, getJob } = require("../jobStore");
const { runPageExtraction } = require("./extraction");

const isJobStopped = (id) => {
  const current = getJob(id);
  if (!current) {
    return true;
  }
  const status = String(current.status || "").toLowerCase();
  return status === "stopped" || status === "paused";
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
  const resolvedStart =
    Number.isFinite(Number(startPageIndex)) && Number(startPageIndex) > 1
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
    await waitForSalesNavReady(driver, Number(process.env.NEXT_PAGE_TIMEOUT_MS || 15000)).catch(
      () => null
    );
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
      console.log(
        `[pagination] page mismatch: expected ${lastPageNumber + 1}, got ${next.pageNumber}`
      );
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

module.exports = {
  runPaginatedExtraction,
  isJobStopped,
};
