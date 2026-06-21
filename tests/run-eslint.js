const { ESLint } = require("eslint");
(async function main() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["src/**/*.ts"]);
  const formatter = await eslint.loadFormatter("json");
  const resultText = await formatter.format(results);
  require("fs").writeFileSync("lint-results-proper.json", resultText);
})().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});
