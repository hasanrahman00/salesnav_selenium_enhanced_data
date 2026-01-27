const state = {
  cookiesSaved: false,
  jobs: [],
  bulkCsvText: "",
  bulkFileName: "",
};

const cookiesInput = document.getElementById("cookiesInput");
const cookiesSave = document.getElementById("cookiesSave");
const cookiesValidate = document.getElementById("cookiesValidate");
const cookiesError = document.getElementById("cookiesError");
const listName = document.getElementById("listName");
const listUrl = document.getElementById("listUrl");
const listNameError = document.getElementById("listNameError");
const listUrlError = document.getElementById("listUrlError");
const uploadArea = document.getElementById("uploadArea");
const bulkCsvInput = document.getElementById("bulkCsvInput");
const bulkFileName = document.getElementById("bulkFileName");
const bulkCsvError = document.getElementById("bulkCsvError");
const runScraper = document.getElementById("runScraper");
const jobsBody = document.getElementById("jobsBody");
const toast = document.getElementById("toast");
const notifiedFailures = new Set();

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
};

const formatSeconds = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toFixed(2);
};

const updateRunDisabled = (loading = false) => {
  const hasName = Boolean(listName.value.trim());
  const hasUrl = Boolean(listUrl.value.trim());
  const hasBulk = Boolean(state.bulkCsvText);
  const disabled = loading || !state.cookiesSaved || !hasName || (!hasUrl && !hasBulk);
  runScraper.disabled = disabled;
};

const setButtonLoading = (loading) => {
  const spinner = runScraper.querySelector(".spinner");
  const text = runScraper.querySelector(".btn-text");
  spinner.hidden = !loading;
  text.textContent = loading ? "Starting…" : "Run Scraper";
  updateRunDisabled(loading);
};

const clearErrors = () => {
  listNameError.textContent = "";
  listUrlError.textContent = "";
  listName.classList.remove("error-border");
  listUrl.classList.remove("error-border");
  bulkCsvError.textContent = "";
  uploadArea.classList.remove("error-border");
};

const validateInputs = () => {
  clearErrors();
  let valid = true;
  if (!listName.value.trim()) {
    listNameError.textContent = "List name is required";
    listName.classList.add("error-border");
    valid = false;
  }
  if (!state.bulkCsvText && !listUrl.value.trim()) {
    listUrlError.textContent = "LinkedIn URL is required";
    listUrl.classList.add("error-border");
    valid = false;
  }
  return valid;
};

const setBulkFile = (file, text) => {
  state.bulkFileName = file ? file.name : "";
  state.bulkCsvText = text || "";
  bulkFileName.textContent = state.bulkFileName || "No file selected";
  updateRunDisabled(false);
};

const handleBulkFile = async (file) => {
  if (!file) {
    return;
  }
  bulkCsvError.textContent = "";
  if (!file.name.toLowerCase().endsWith(".csv")) {
    bulkCsvError.textContent = "Only CSV files are supported";
    uploadArea.classList.add("error-border");
    return;
  }
  uploadArea.classList.remove("error-border");
  const text = await file.text();
  setBulkFile(file, text);
};

const renderJobs = () => {
  jobsBody.innerHTML = "";
  if (state.jobs.length === 0) {
    jobsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state">
            <span>🗂️</span>
            <p>No jobs yet. Create one above.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  state.jobs.forEach((job) => {
    const badgeClass = job.status.toLowerCase();
    const isRunning = String(job.status || "").toLowerCase() === "running";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${job.name}</strong></td>
      <td class="right">${job.total}</td>
      <td>${job.urlNumber ?? "—"}</td>
      <td>${job.pageIndex ?? "—"}</td>
      <td>${formatSeconds(job.totalSeconds)}</td>
      <td><span class="badge ${badgeClass}">${job.status}</span></td>
      <td class="actions">
        <button class="btn ghost" data-action="toggle" data-id="${job.id}">
          ${isRunning ? "Pause" : "Run"}
        </button>
        <button class="btn secondary" data-action="download" data-id="${job.id}" ${
          job.total === 0 ? "disabled" : ""
        }>
          Download
        </button>
        <button class="btn danger" data-action="delete" data-id="${job.id}">
          Delete
        </button>
      </td>
    `;
    jobsBody.appendChild(row);
    if (job.status === "Failed" && job.error && !notifiedFailures.has(job.id)) {
      showToast(job.error);
      notifiedFailures.add(job.id);
    }
  });
};

const fetchJobs = async () => {
  const res = await fetch("/api/jobs");
  state.jobs = await res.json();
  renderJobs();
};

const fetchCookieStatus = async () => {
  const res = await fetch("/api/cookies/linkedin/status");
  const data = await res.json();
  state.cookiesSaved = Boolean(data.saved);
  updateRunDisabled(false);
};

const saveCookies = async () => {
  cookiesError.textContent = "";
  cookiesInput.classList.remove("error-border");
  try {
    const res = await fetch("/api/cookies/linkedin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookies: cookiesInput.value }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Invalid JSON format");
    }
    state.cookiesSaved = true;
    showToast("Cookies saved");
    setButtonLoading(false);
  } catch (error) {
    cookiesError.textContent = error.message;
    cookiesInput.classList.add("error-border");
  }
};

const validateCookies = () => {
  cookiesError.textContent = "";
  cookiesInput.classList.remove("error-border");
  try {
    JSON.parse(cookiesInput.value);
    showToast("Cookies look valid");
  } catch (error) {
    cookiesError.textContent = "Invalid JSON format";
    cookiesInput.classList.add("error-border");
  }
};

const runJob = async () => {
  if (!validateInputs()) {
    return;
  }
  setButtonLoading(true);
  const isBulk = Boolean(state.bulkCsvText);
  const endpoint = isBulk ? "/api/jobs/run-bulk" : "/api/jobs/run";
  const payload = isBulk
    ? { listName: listName.value, csvText: state.bulkCsvText }
    : { listName: listName.value, listUrl: listUrl.value };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json();
    listNameError.textContent = data.message || "Failed to start job";
    setButtonLoading(false);
    return;
  }
  listName.value = "";
  listUrl.value = "";
  setBulkFile(null, "");
  setButtonLoading(false);
  fetchJobs();
};

const handleAction = async (event) => {
  const target = event.target;
  if (!target.dataset.action) {
    return;
  }
  const id = target.dataset.id;
  if (target.dataset.action === "toggle") {
    const job = state.jobs.find((item) => item.id === id);
    if (!job) {
      return;
    }
    if (job.status === "Running") {
      await fetch(`/api/jobs/${id}/stop`, { method: "POST" });
    } else {
      await fetch(`/api/jobs/${id}/run`, { method: "POST" });
    }
    fetchJobs();
    return;
  }
  if (target.dataset.action === "download") {
    window.location.href = `/api/jobs/${id}/download`;
    return;
  }
  if (target.dataset.action === "delete") {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    fetchJobs();
  }
};

cookiesSave.addEventListener("click", saveCookies);
cookiesValidate.addEventListener("click", validateCookies);
runScraper.addEventListener("click", runJob);
jobsBody.addEventListener("click", handleAction);
listName.addEventListener("input", () => updateRunDisabled(false));
listUrl.addEventListener("input", () => updateRunDisabled(false));
bulkCsvInput.addEventListener("change", (event) => handleBulkFile(event.target.files[0]));
uploadArea.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));
uploadArea.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadArea.classList.remove("dragover");
  handleBulkFile(event.dataTransfer.files[0]);
});

setButtonLoading(false);
fetchCookieStatus();
fetchJobs();
setInterval(fetchJobs, 4000);
