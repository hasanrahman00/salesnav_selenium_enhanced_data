const app = require("./app");
const { port } = require("./config/env");
const { ensureChrome } = require("./utils/downloadChrome");

ensureChrome()
  .then(({ chromePath, driverPath }) => {
    process.env.CHROME_BINARY = chromePath;
    process.env.CHROMEDRIVER_BINARY = driverPath;
    app.listen(port, () => {
      console.log(`Server listening on ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to prepare Chrome binary:", err);
    process.exit(1);
  });
