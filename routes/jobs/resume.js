const express = require("express");
const { resumeJob } = require("../../services/jobRunner");
const { resumeBulkJob } = require("../../services/bulkJobRunner");
const { getJob } = require("../../services/jobStore");

const router = express.Router();

router.post("/:id/run", async (req, res) => {
  const current = getJob(req.params.id);
  if (!current) {
    return res.status(404).json({ message: "Job not found" });
  }
  const job = current.bulk ? await resumeBulkJob(req.params.id) : await resumeJob(req.params.id);
  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }
  return res.json(job);
});

module.exports = router;
