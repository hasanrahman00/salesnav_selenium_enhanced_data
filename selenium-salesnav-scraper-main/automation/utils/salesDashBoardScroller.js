const { By, waitForAnyVisible } = require("./dom");

const randInt = (min, max) => {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
};

const salesDashBoardScroller = async (driver, opts = {}) => {
  const {
    trackerSelector = "a[data-control-name^='view_lead_panel']",
    scrollSelector = null,
    maxSteps = 40,
    stepPx = 200,
    minDelayMs = 200,
    maxDelayMs = 550,
    highlight = false,
    timeoutMs = 15000,
    maxRounds = 20,
    bottomStallLimit = 4,
  } = opts;

  await waitForAnyVisible(driver, [By.css(trackerSelector)], timeoutMs);

  const result = await driver.executeScript(`
    const cfg = arguments[0];
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
    let el = null;
    if (cfg.scrollSelector) {
      el = document.querySelector(cfg.scrollSelector);
    }
    if (!el) {
      const cands = Array.from(document.querySelectorAll('main, section, div, ul, ol'))
        .filter((n) => n.scrollHeight > n.clientHeight && n.offsetHeight > 300)
        .sort((a, b) => b.clientHeight - a.clientHeight);
      el = cands[0] || null;
    }
    if (!el) {
      return 'no-scroll-container';
    }
    if (cfg.highlight) {
      el.style.outline = '2px solid red';
    }
    let lastTop = -1;
    let same = 0;
    let rounds = 0;
    while (rounds < cfg.maxRounds) {
      for (let i = 0; i < cfg.maxSteps; i++) {
        el.scrollBy({ top: cfg.stepPx, behavior: 'smooth' });
        await delay(rand(cfg.minDelayMs, cfg.maxDelayMs));
        const curr = el.scrollTop;
        if (curr === lastTop) {
          same += 1;
          if (same >= cfg.bottomStallLimit) {
            return 'scroll-complete';
          }
        } else {
          same = 0;
          lastTop = curr;
        }
      }
      rounds += 1;
    }
    return 'scroll-max-rounds';
  `, {
    scrollSelector,
    maxSteps,
    stepPx,
    minDelayMs,
    maxDelayMs,
    highlight,
    maxRounds,
    bottomStallLimit,
  });

  return result;
};

const humanScrollSalesDashboard = async (driver, opts = {}) => {
  const steps = randInt(opts.minSteps || 7, opts.maxSteps || 10);
  return salesDashBoardScroller(driver, {
    trackerSelector: opts.trackerSelector,
    scrollSelector: opts.scrollSelector,
    maxSteps: steps,
    stepPx: opts.stepPx || 200,
    minDelayMs: opts.minDelayMs || 200,
    maxDelayMs: opts.maxDelayMs || 550,
    highlight: opts.highlight || false,
    timeoutMs: opts.timeoutMs || 15000,
    maxRounds: opts.maxRounds || 20,
    bottomStallLimit: opts.bottomStallLimit || 4,
  });
};

module.exports = {
  salesDashBoardScroller,
  humanScrollSalesDashboard,
};
