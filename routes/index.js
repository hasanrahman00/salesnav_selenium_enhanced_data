const express = require("express");
const cookiesSave = require("./cookies/save");
const cookiesStatus = require("./cookies/status");
const jobsRun = require("./jobs/run");
const jobsRunBulk = require("./jobs/runBulk");
const jobsStop = require("./jobs/stop");
const jobsResume = require("./jobs/resume");
const jobsDelete = require("./jobs/delete");
const jobsDownload = require("./jobs/download");
const jobsList = require("./jobs/list");
const jobsBulkTemplate = require("./jobs/bulkTemplate");
const enrichStart = require("./enrich/start");
const enrichStatus = require("./enrich/status");
const enrichPause = require("./enrich/pause");
const enrichResume = require("./enrich/resume");
const enrichStop = require("./enrich/stop");

const router = express.Router();

router.use("/cookies", cookiesSave);
router.use("/cookies", cookiesStatus);
router.use("/jobs", jobsRun);
router.use("/jobs", jobsRunBulk);
router.use("/jobs", jobsStop);
router.use("/jobs", jobsResume);
router.use("/jobs", jobsDelete);
router.use("/jobs", jobsDownload);
router.use("/jobs", jobsList);
router.use("/jobs", jobsBulkTemplate);
router.use("/enrich", enrichStart);
router.use("/enrich", enrichStatus);
router.use("/enrich", enrichPause);
router.use("/enrich", enrichResume);
router.use("/enrich", enrichStop);

module.exports = router;
