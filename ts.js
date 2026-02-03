const { cleanName } = require("./utils/nameCleaner");

const samples = [
  "James J. Talerico, Jr. LION (30,000 Followers",
];

for (const sample of samples) {
  console.log(`${sample} -> ${cleanName(sample)}`);
}
