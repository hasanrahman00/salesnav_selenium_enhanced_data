const express = require("express");
const { stopJob } = require("../../services/jobRunner");
const { stopBulkJob } = require("../../services/bulkJobRunner");
const { getJob } = require("../../services/jobStore");

const router = express.Router();

router.post("/:id/stop", async (req, res) => {
  const existing = getJob(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Job not found" });
  }
  const job = existing.bulk ? await stopBulkJob(req.params.id) : await stopJob(req.params.id);
  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }
  return res.json(job);
});

module.exports = router;
