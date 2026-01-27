const express = require("express");

const router = express.Router();

router.get("/bulk-template", (req, res) => {
  const csv = "url_number,url\n1,https://www.linkedin.com/sales/lead/12345\n2,https://www.linkedin.com/sales/lead/67890\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=bulk-template.csv");
  return res.send(csv);
});

module.exports = router;
