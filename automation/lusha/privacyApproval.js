const { By } = require("../utils/dom");

const findLushaFrame = async (driver) => {
  const frames = await driver.findElements(By.css("iframe"));
  for (const frame of frames) {
    try {
      const id = await frame.getAttribute("id");
      if (id === "LU__extension_iframe") {
        return frame;
      }
    } catch (error) {
      // ignore
    }
  }
  return null;
};

const clickLushaPrivacyApproval = async (driver) => {
  const frame = await findLushaFrame(driver);
  if (!frame) {
    return false;
  }
  try {
    await driver.switchTo().frame(frame);
    const clicked = await driver.executeScript(`
      const button = document.querySelector('[data-test-id="privacy-approval-button"]')
        || Array.from(document.querySelectorAll('button')).find((b) =>
          /got it,?\s*lets? go/i.test((b.textContent || ''))
        );
      if (button) {
        button.click();
        return true;
      }
      return false;
    `);
    return Boolean(clicked);
  } catch (error) {
    return false;
  } finally {
    try {
      await driver.switchTo().defaultContent();
    } catch (switchError) {
      // ignore
    }
  }
};

module.exports = {
  clickLushaPrivacyApproval,
};
