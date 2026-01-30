const { By } = require("../../automation/utils/dom");
const { confirmLoginInNewTab, isLoginPage } = require("../scraper/auth");

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
  const newTab = await waitForNewTab(
    driver,
    existingHandles,
    Number(process.env.CONTACTOUT_LOGIN_TAB_WAIT_MS || 9000)
  );
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

module.exports = {
  createAuthError,
  ensureExtensionAuth,
  detectLushaLoginPanel,
  detectContactoutLoginPanel,
  attemptContactoutPanelLogin,
};
