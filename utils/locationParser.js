const { countries } = require("./countryList");

const normalizeToken = (value) =>
  String(value || "")
    .trim()
    .replace(/\./g, "")
    .toLowerCase();

const countrySet = new Set(countries.map((name) => normalizeToken(name)));

const isCountry = (value) => {
  if (!value) {
    return false;
  }
  return countrySet.has(normalizeToken(value));
};

const splitLocation = (location) => {
  const cleaned = String(location || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { city: "", state: "", country: "" };
  }
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[0];
    const country = parts[parts.length - 1];
    const state = parts.slice(1, parts.length - 1).join(", ");
    return { city, state, country };
  }
  if (parts.length === 2) {
    const city = parts[0];
    const second = parts[1];
    if (isCountry(second)) {
      return { city, state: "", country: second };
    }
    return { city, state: second, country: "" };
  }
  const single = parts[0] || cleaned;
  if (isCountry(single)) {
    return { city: "", state: "", country: single };
  }
  return { city: single, state: "", country: "" };
};

module.exports = {
  splitLocation,
  isCountry,
};
