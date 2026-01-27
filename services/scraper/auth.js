const normalizeSameSite = (value) => {
  if (!value) {
    return undefined;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === "no_restriction" || normalized === "none") {
    return "None";
  }
  if (normalized === "lax") {
    return "Lax";
  }
  if (normalized === "strict") {
    return "Strict";
  }
  return undefined;
};

const normalizeCookie = (cookie) => {
  if (!cookie || !cookie.name) {
    return null;
  }
  const normalized = {
    name: cookie.name,
    value: cookie.value ?? "",
  };
  if (cookie.domain) {
    if (cookie.hostOnly === true) {
      normalized.domain = cookie.domain.replace(/^\./, "");
    } else {
      normalized.domain = cookie.domain;
    }
  }
  if (cookie.path) {
    normalized.path = cookie.path;
  }
  if (typeof cookie.secure === "boolean") {
    normalized.secure = cookie.secure;
  }
  if (typeof cookie.httpOnly === "boolean") {
    normalized.httpOnly = cookie.httpOnly;
  }
  if (typeof cookie.expirationDate === "number" && Number.isFinite(cookie.expirationDate)) {
    normalized.expiry = Math.floor(cookie.expirationDate);
  }
  const sameSite = normalizeSameSite(cookie.sameSite);
  if (sameSite) {
    normalized.sameSite = sameSite;
  }
  return normalized;
};

const setCookiesFor = async (driver, url, cookies, redirectUrl) => {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return false;
  }
  try {
    await driver.get(url);
  } catch (error) {
    console.warn(`Failed to open ${url}: ${error.message || error}`);
    return false;
  }
  const navigationGapMs = Number(process.env.NAV_GAP_MS || 1200);
  if (navigationGapMs > 0) {
    await driver.sleep(navigationGapMs);
  }
  const prepared = cookies.map((cookie) => normalizeCookie(cookie)).filter(Boolean);
  for (const cookie of prepared) {
    try {
      await driver.manage().addCookie(cookie);
    } catch (error) {
      // ignore invalid cookies
    }
  }
  const postCookieGapMs = Number(process.env.POST_COOKIE_GAP_MS || 800);
  if (postCookieGapMs > 0) {
    await driver.sleep(postCookieGapMs);
  }
  const targetUrl = redirectUrl || url;
  try {
    await driver.get(targetUrl);
  } catch (error) {
    console.warn(`Failed to open ${targetUrl}: ${error.message || error}`);
  }
  if (navigationGapMs > 0) {
    await driver.sleep(navigationGapMs);
  }
  return true;
};

const isLoginPage = (url, title) => {
  const haystack = `${url || ""} ${title || ""}`.toLowerCase();
  return (
    haystack.includes("login") ||
    haystack.includes("sign-in") ||
    haystack.includes("signin") ||
    haystack.includes("checkpoint") ||
    haystack.includes("auth")
  );
};

const confirmLogin = async ({ driver, name, baseUrl, confirmUrl, cookies }) => {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return { ok: false, message: `${name} cookies are missing.` };
  }
  const opened = await setCookiesFor(driver, baseUrl, cookies, confirmUrl);
  if (!opened) {
    return { ok: false, message: `${name} site is not reachable.` };
  }
  const confirmDelayMs = Number(process.env.CONFIRM_DELAY_MS || 1500);
  if (confirmDelayMs > 0) {
    await driver.sleep(confirmDelayMs);
  }
  const currentUrl = await driver.getCurrentUrl();
  const title = await driver.getTitle();
  if (isLoginPage(currentUrl, title)) {
    return {
      ok: false,
      message: `${name} login failed. Redirected to login page.`,
    };
  }
  return { ok: true };
};

const confirmLoginInNewTab = async ({ driver, name, baseUrl, confirmUrl, cookies }) => {
  const original = await driver.getWindowHandle();
  const tab = await driver.switchTo().newWindow("tab");
  let result;
  try {
    result = await confirmLogin({ driver, name, baseUrl, confirmUrl, cookies });
  } finally {
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
  }
  return result;
};

module.exports = {
  normalizeSameSite,
  normalizeCookie,
  setCookiesFor,
  isLoginPage,
  confirmLogin,
  confirmLoginInNewTab,
};
