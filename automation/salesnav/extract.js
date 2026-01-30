const { waitForSalesNavReady } = require("../utils/dom");
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

const extractSalesNavLeads = async (driver, { timeoutMs = 15000 } = {}) => {
  await waitForSalesNavReady(driver, timeoutMs).catch(() => null);

  const raw = await driver.executeScript(`
    const getText = (el) => (el ? (el.textContent || '').trim() : '');
    const results = [];
    const seen = new Set();
    const itemSelector = [
      'div.search-results__result-item',
      'li.search-results__result-item',
      '.search-results__result-item',
      'li.search-results__result-list__item',
      '.reusable-search__result-container',
      '.artdeco-entity-lockup'
    ].join(',');

    const normalizeItem = (anchor) => {
      if (!anchor) return null;
      return anchor.closest(itemSelector) || anchor.parentElement || null;
    };

    let items = Array.from(document.querySelectorAll(itemSelector));
    if (!items.length) {
      const anchors = Array.from(document.querySelectorAll(
        'a[data-lead-search-result][href*="/sales/lead/"] , a[data-control-name*="view_lead_panel"]'
      ));
      items = anchors.map(normalizeItem).filter(Boolean);
    }

    for (const item of items) {
      const nameEl = item.querySelector('[data-anonymize="person-name"]');
      const anchor = nameEl
        ? nameEl.closest('a')
        : item.querySelector('a[data-lead-search-result][href*="/sales/lead/"]')
          || item.querySelector('a[data-control-name*="view_lead_panel"]');
      const fullName = getText(nameEl) || getText(anchor);
      const href = anchor ? anchor.getAttribute('href') : '';
      const titleEl = item.querySelector('[data-anonymize="title"]');
      const companyEl = item.querySelector('[data-anonymize="company-name"]');
      const locationEl = item.querySelector('[data-anonymize="location"]');
      const premium = Boolean(
        item.querySelector('li-icon[type="linkedin-premium-gold-icon"]')
      );
      const metaEl = item.querySelector('[data-anonymize="job-title"], .artdeco-entity-lockup__metadata');
      const metaText = getText(metaEl);

      const key = href || fullName;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);

      results.push({
        fullName,
        title: getText(titleEl),
        companyName: getText(companyEl),
        location: getText(locationEl),
        premium,
        metaText,
        href,
      });
    }
    return results;
  `);

  const records = Array.isArray(raw) ? raw : [];
  return records.map((record) => {
    const cleanedFullName = cleanName(record.fullName || "");
    const { firstName, lastName } = splitName(cleanedFullName);
    const { salesNavUrl, publicUrl } = normalizeLeadUrl(record.href || "");
    const locationParts = splitLocation(record.location || "");
    const roleCompany = parseInRoleCompany(record.metaText || "");

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
    };
  });
};

module.exports = {
  extractSalesNavLeads,
};
