const { By, waitForSalesNavReady } = require("../utils/dom");
const { cleanName } = require("../../utils/nameCleaner");
const { splitLocation } = require("../../utils/locationParser");

const splitName = (fullName) => {
  const cleaned = String(fullName || "").trim();
  if (!cleaned) {
    return { firstName: "", lastName: "" };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const parseInRoleCompany = (text) => {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { inRole: "", inCompany: "" };
  }
  const lower = cleaned.toLowerCase();
  const roleToken = "in role";
  const companyToken = "in company";
  const roleIndex = lower.indexOf(roleToken);
  const companyIndex = lower.indexOf(companyToken);
  let inRole = "";
  let inCompany = "";

  if (roleIndex !== -1) {
    inRole = cleaned.slice(0, roleIndex).trim();
  }
  if (companyIndex !== -1) {
    const start = roleIndex !== -1 ? roleIndex + roleToken.length : 0;
    inCompany = cleaned.slice(start, companyIndex).trim();
  }

  if (!inRole && !inCompany) {
    const parts = cleaned.split(/\||·/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      inRole = parts[0];
      inCompany = parts[1];
    } else if (parts.length === 1) {
      if (lower.includes(companyToken)) {
        inCompany = parts[0].replace(/in\s+company/i, "").trim();
      } else if (lower.includes(roleToken)) {
        inRole = parts[0].replace(/in\s+role/i, "").trim();
      }
    }
  }

  return { inRole, inCompany };
};

const normalizeLeadUrl = (href) => {
  if (!href) {
    return { salesNavUrl: "", publicUrl: "" };
  }
  let raw = String(href || "").trim();
  if (!raw) {
    return { salesNavUrl: "", publicUrl: "" };
  }
  if (raw.startsWith("http")) {
    try {
      const parsed = new URL(raw);
      raw = parsed.pathname + parsed.search;
    } catch (error) {
      // ignore
    }
  }
  const trimmed = raw.split(",")[0];
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const salesNavUrl = trimmed.startsWith("http") ? trimmed : `https://www.linkedin.com${cleanPath}`;
  const leadPrefix = "/sales/lead/";
  let publicUrl = "";
  if (cleanPath.includes(leadPrefix)) {
    const id = cleanPath.split(leadPrefix)[1] || "";
    if (id) {
      publicUrl = `https://www.linkedin.com/in/${id}`;
    }
  }
  return { salesNavUrl, publicUrl };
};

const normalizeSalesLeadUrl = (href) => {
  if (!href) {
    return "";
  }
  let raw = String(href || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("http")) {
    try {
      const parsed = new URL(raw);
      raw = parsed.pathname + parsed.search;
    } catch (error) {
      // ignore
    }
  }
  const leadPrefix = "/sales/lead/";
  const cleanPath = raw.startsWith("/") ? raw : `/${raw}`;
  if (!cleanPath.includes(leadPrefix)) {
    return "";
  }
  let id = cleanPath.split(leadPrefix)[1] || "";
  if (!id) {
    return "";
  }
  id = id.split(",")[0].split("?")[0].trim();
  if (!id) {
    return "";
  }
  return `https://www.linkedin.com/sales/lead/${id}`;
};

const normalizeCompanyUrl = (href) => {
  if (!href) {
    return "";
  }
  let raw = String(href || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("http")) {
    try {
      const parsed = new URL(raw);
      raw = parsed.pathname + parsed.search;
    } catch (error) {
      // ignore
    }
  }
  const prefix = "/sales/company/";
  const cleanPath = raw.startsWith("/") ? raw : `/${raw}`;
  if (!cleanPath.includes(prefix)) {
    return "";
  }
  let id = cleanPath.split(prefix)[1] || "";
  if (!id) {
    return "";
  }
  id = id.split("?")[0].split("/")[0].trim();
  if (!id) {
    return "";
  }
  return `https://www.linkedin.com/company/${id}/`;
};

const splitCompanyAddress = (value) => {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return { address: "", city: "", state: "", country: "" };
  }
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      address: raw,
      city: parts[0] || "",
      state: parts[1] || "",
      country: parts.slice(2).join(", ") || "",
    };
  }
  if (parts.length === 2) {
    return {
      address: raw,
      city: "",
      state: parts[0] || "",
      country: parts[1] || "",
    };
  }
  return {
    address: raw,
    city: "",
    state: "",
    country: parts[0] || "",
  };
};

const normalizeHeadCount = (value) => {
  const text = String(value || "");
  const match = text.match(/\d[\d,]*/);
  if (!match) {
    return "";
  }
  return match[0].replace(/,/g, "");
};

const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractHoverSnapshot = async (driver) => {
  const snapshot = await driver.executeScript(`
    const getText = (el) => (el ? (el.textContent || '').trim() : '');
    const getTitleOrText = (el) => {
      if (!el) return '';
      const title = el.getAttribute('title');
      if (title && title.trim()) {
        return title.trim();
      }
      return getText(el);
    };
    const hover =
      document.querySelector('.entity-hovercard') ||
      document.querySelector('[class*="hovercard"]') ||
      document.querySelector('.artdeco-hoverable-content__content') ||
      document.querySelector('[role="tooltip"]');
    if (!hover) {
      return null;
    }
    const location = getText(hover.querySelector('[data-anonymize="location"]'));
    const industry = getText(hover.querySelector('[data-anonymize="industry"]'));
    const headCount =
      getText(hover.querySelector('[data-anonymize="company-size"]')) ||
      getText(hover.querySelector('a[href*="employees-for-account"]'));
    const description = getTitleOrText(hover.querySelector('[data-anonymize="company-blurb"]'));
    const about = getTitleOrText(hover.querySelector('[data-anonymize="person-blurb"]'));
    return { location, industry, headCount, description, about };
  `);
  return snapshot || null;
};

const extractSalesNavLeads = async (driver, { timeoutMs = 15000 } = {}) => {
  await waitForSalesNavReady(driver, timeoutMs).catch(() => null);

  const collectVisible = async () => {
    return driver.executeScript(`
      const getText = (el) => (el ? (el.textContent || '').trim() : '');
      const results = [];
      const itemSelector = [
        'div.search-results__result-item',
        'li.search-results__result-item',
        '.search-results__result-item',
        'li.search-results__result-list__item',
        '.reusable-search__result-container',
        '.artdeco-entity-lockup',
        '[data-test-search-result]',
        '[data-test-search-result-item]'
      ].join(',');

      const normalizeItem = (anchor) => {
        if (!anchor) return null;
        return anchor.closest(itemSelector) || anchor.parentElement || null;
      };

      let items = Array.from(document.querySelectorAll(itemSelector));
      let anchors = [];
      if (!items.length) {
        anchors = Array.from(document.querySelectorAll(
          'a[data-lead-search-result][href*="/sales/lead/"], a[data-control-name*="view_lead_panel"], a[href*="/sales/lead/"]'
        ));
        items = anchors.map(normalizeItem).filter(Boolean);
      }
      if (!items.length && anchors.length) {
        items = anchors.slice();
      }

      for (const item of items) {
        const isAnchor = item && item.tagName && item.tagName.toLowerCase() === 'a';
        const base = isAnchor
          ? (item.closest(itemSelector) || item.closest('li, div, article, section') || item)
          : item;
        const nameEl = base.querySelector('[data-anonymize="person-name"]');
        const anchor = nameEl
          ? nameEl.closest('a')
          : base.querySelector('a[data-lead-search-result][href*="/sales/lead/"]')
            || base.querySelector('a[data-control-name*="view_lead_panel"]')
            || base.querySelector('a[href*="/sales/lead/"]');
        const fullName = getText(nameEl) || getText(anchor) || getText(base.querySelector('a[href*="/sales/lead/"]'));
        const href = anchor ? anchor.getAttribute('href') : '';
        const titleEl = base.querySelector('[data-anonymize="title"]');
        const companyEl = base.querySelector('[data-anonymize="company-name"]')
          || base.querySelector('a[data-anonymize="company-name"]')
          || base.querySelector('a.link--mercado')
          || base.querySelector('a[href*="/sales/company/"]');
        const companyAnchor = companyEl && companyEl.closest('a') ? companyEl.closest('a') : companyEl;
        const companyHref = companyAnchor ? companyAnchor.getAttribute('href') : '';
        const locationEl = base.querySelector('[data-anonymize="location"]');
        const premium = Boolean(
          base.querySelector('li-icon[type="linkedin-premium-gold-icon"]')
        );
        const metaEl = base.querySelector('[data-anonymize="job-title"], .artdeco-entity-lockup__metadata');
        const metaText = getText(metaEl);

        let personAnchorId = '';
        let companyAnchorId = '';
        if (anchor && href) {
          const key = btoa(href).replace(/=+/g, '');
          personAnchorId = anchor.dataset.snLeadHoverId || ('sn-lead-hover-' + key);
          anchor.dataset.snLeadHoverId = personAnchorId;
        }
        if (companyAnchor && companyHref) {
          const key = btoa(companyHref).replace(/=+/g, '');
          companyAnchorId = companyAnchor.dataset.snCompanyHoverId || ('sn-company-hover-' + key);
          companyAnchor.dataset.snCompanyHoverId = companyAnchorId;
        }

        results.push({
          fullName,
          title: getText(titleEl),
          companyName: getText(companyEl),
          location: getText(locationEl),
          premium,
          metaText,
          href,
          companyHref,
          personAnchorId,
          companyAnchorId,
        });
      }
      return results;
    `);
  };

  const raw = await collectVisible();
  const records = Array.isArray(raw) ? raw : [];

  return records.map((record) => {
    const cleanedFullName = cleanName(record.fullName || "");
    const { firstName, lastName } = splitName(cleanedFullName);
    const { salesNavUrl, publicUrl } = normalizeLeadUrl(record.href || "");
    const locationParts = splitLocation(record.location || "");
    const roleCompany = parseInRoleCompany(record.metaText || "");
    const personSalesUrl = normalizeSalesLeadUrl(record.href || "");

    return {
      fullName: cleanedFullName,
      firstName,
      lastName,
      title: record.title || "",
      companyName: record.companyName || "",
      personLinkedIn: publicUrl,
      personCity: locationParts.city,
      personState: locationParts.state,
      personCountry: locationParts.country,
      linkedinPremium: record.premium ? "True" : "False",
      inRole: roleCompany.inRole,
      inCompany: roleCompany.inCompany,
      linkedinUrl: publicUrl || salesNavUrl,
      personSalesUrl,
      companyAddress: "",
      companyCity: "",
      companyState: "",
      companyCountry: "",
      companyIndustry: "",
      companyHeadCount: "",
      companyDescription: "",
      companyLinkedin: "",
      personAbout: "",
    };
  });
};

module.exports = {
  extractSalesNavLeads,
};
