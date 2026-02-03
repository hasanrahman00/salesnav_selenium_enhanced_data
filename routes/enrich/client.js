const http = require("http");
const https = require("https");

const requestJson = (url, { method = "GET", payload, timeoutMs = 15000 } = {}) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = payload ? JSON.stringify(payload) : "";
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        method,
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
    if (body) {
      req.write(body);
    }
    req.end();
  });

module.exports = {
  requestJson,
};
