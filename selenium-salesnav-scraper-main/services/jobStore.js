
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const jobsFile = path.join(__dirname, "..", "data", "jobs.json");

const jobs = new Map();

function saveJobsToDisk() {
  try {
    const arr = Array.from(jobs.values());
    fs.writeFileSync(jobsFile, JSON.stringify(arr, null, 2));
  } catch (e) {
    // ignore disk errors
  }
}

function loadJobsFromDisk() {
  try {
    if (fs.existsSync(jobsFile)) {
      const arr = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
      arr.forEach((job) => jobs.set(job.id, job));
    }
  } catch (e) {
    // ignore disk errors
  }
}

loadJobsFromDisk();

const createJob = ({ listName, listUrl, filePath }) => {
  const id = uuid();
  const name = `${listName} #${id.slice(0, 8)}`;
  const job = {
    id,
    name,
    listName,
    listUrl,
    status: "Running",
    total: 0,
    filePath,
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  saveJobsToDisk();
  return job;
};

const updateJob = (id, patch) => {
  const current = jobs.get(id);
  if (!current) {
    return null;
  }
  const next = { ...current, ...patch };
  jobs.set(id, next);
  saveJobsToDisk();
  return next;
};

const getJob = (id) => jobs.get(id);

const listJobs = () => Array.from(jobs.values());

const removeJob = (id) => {
  jobs.delete(id);
  saveJobsToDisk();
};

module.exports = {
  createJob,
  updateJob,
  getJob,
  listJobs,
  removeJob,
};
