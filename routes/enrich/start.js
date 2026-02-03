const express = require("express");
const http = require("http");
const https = require("https");
const { getJob } = require("../../services/jobStore");
const { enricherBaseUrl } = require("../../config/env");

const router = express.Router();

const postJson = (url, payload, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload || {});
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        method: "POST",
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch (error) {
            json = null;
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            data: json,
            raw: data,
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Enricher request timed out"));
    });
    req.write(body);
    req.end();
  });

router.post("/start", async (req, res) => {
  const jobId = String(req.body.jobId || "").trim();
  if (!jobId) {
    return res.status(400).json({ message: "Job id is required" });
  }
  const job = getJob(jobId);
  if (!job || !job.filePath) {
    return res.status(404).json({ message: "Job not found" });
  }
  const baseUrl = enricherBaseUrl || "http://localhost:3006";
  try {
    console.info("[enrich/start] Sending to enricher", {
      jobId: job.id,
      filePath: job.filePath,
      baseUrl,
    });
    const result = await postJson(`${baseUrl}/api/enrich/start`, {
      jobId: job.id,
      filePath: job.filePath,
    });
    console.info("[enrich/start] Enricher response", {
      ok: result.ok,
      status: result.status,
      data: result.data,
      raw: result.raw,
    });
    if (!result.ok) {
      return res.status(502).json({
        message: result.data?.message || "Failed to start enricher",
        jobId: job.id,
        filePath: job.filePath,
      });
    }
    return res.json({
      jobId: job.id,
      filePath: job.filePath,
      enricher: result.data || null,
    });
  } catch (error) {
    return res.status(502).json({
      message: error.message || "Failed to contact enricher",
      jobId: job.id,
      filePath: job.filePath,
    });
  }
});

module.exports = router;