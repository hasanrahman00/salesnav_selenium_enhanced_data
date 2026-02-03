const express = require("express");
const { enricherBaseUrl } = require("../../config/env");
const { requestJson } = require("./client");

const router = express.Router();

router.get("/status/:jobId", async (req, res) => {
  const jobId = String(req.params.jobId || "").trim();
  if (!jobId) {
    return res.status(400).json({ message: "Job id is required" });
  }
  const baseUrl = enricherBaseUrl || "http://localhost:3006";
  try {
    const result = await requestJson(`${baseUrl}/api/enrich/status/${jobId}`);
    if (!result.ok) {
      return res.status(result.status || 502).json({
        message: result.data?.message || result.data?.error || "Failed to fetch enricher status",
      });
    }
    return res.json(result.data || {});
  } catch (error) {
    return res.status(502).json({ message: error.message || "Failed to contact enricher" });
  }
});

module.exports = router;
