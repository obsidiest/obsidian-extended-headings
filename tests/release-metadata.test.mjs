import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("uses obsidiest consistently in public project metadata", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const packageJson = JSON.parse(read("package.json"));
  const license = read("LICENSE");

  assert.equal(manifest.author, "obsidiest");
  assert.equal(manifest.authorUrl, "https://github.com/obsidiest");
  assert.equal(packageJson.author.name, "obsidiest");
  assert.equal(packageJson.author.url, "https://github.com/obsidiest");
  assert.match(license, /Copyright \(c\) 2026 obsidiest/);
});

test("keeps release versions and compatibility metadata synchronized", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const packageJson = JSON.parse(read("package.json"));
  const versions = JSON.parse(read("versions.json"));

  assert.equal(manifest.version, "0.4.9");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

test("documents compatibility, disclosures, attribution, and licensing", () => {
  const readme = read("README.md");
  const changelog = read("CHANGELOG.md");

  assert.match(readme, /Latest compatibility target:\*\* Obsidian 1\.13\.7/);
  assert.match(readme, /Privacy, security, and file-change disclosures/);
  assert.match(readme, /GPT-5\.6 Sol \(Extra High\), OpenAI/);
  assert.match(readme, /GPT-5\.6 Sol \(Max\), OpenAI/);
  assert.match(readme, /\[MIT\]\(LICENSE\)/);
  assert.match(changelog, /## 0\.4\.9/);
});

test("builds production output for GitHub release assets", () => {
  const build = read("esbuild.config.mjs");
  const release = read(".github/workflows/release.yml");

  assert.match(build, /outfile: "dist\/main\.js"/);
  assert.match(build, /minify: production/);
  assert.match(release, /dist\/main\.js/);
  assert.match(release, /manifest\.json/);
  assert.match(release, /styles\.css/);
  assert.match(release, /actions\/attest@v4/);
  assert.match(release, /attestations: write/);
  assert.match(release, /id-token: write/);
  assert.match(release, /generate_release_notes: true/);
});
