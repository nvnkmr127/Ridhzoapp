// Rebuilds docs-consolidated/*.md from the source files in docs/. The chapter files keep their own header
// (title, description) and their "Contents" list — which source file belongs in which chapter lives THERE.
// To add a document: add a line to a chapter's Contents list, then run this. NEVER edit a chapter body by
// hand; edit the source under docs/ and regenerate.
//
//   npm run docs:consolidate             rewrite the chapters
//   npm run docs:consolidate -- --check  fail (exit 1) if any chapter is out of date (used in CI)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "docs-consolidated";
const check = process.argv.includes("--check");

// Nest headings two levels deeper (skipping fenced code), capped at h6.
function nest(md) {
  let fence = false;
  return md.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return line;
    const m = /^(#{1,6})(\s.*)$/.exec(line);
    return m ? `${"#".repeat(Math.min(6, m[1].length + 2))}${m[2]}` : line;
  }).join("\n");
}

let stale = 0;
for (const file of readdirSync(OUT).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()) {
  const path = join(OUT, file);
  const old = readFileSync(path, "utf8");
  const lines = old.split("\n");
  const title = lines[0];
  const desc = lines[2] ?? "";
  const items = [...old.matchAll(/^\d+\. \[(.+?)\]\(#[^)]*\) — `(.+?)`$/gm)].map((m) => ({ heading: m[1], src: m[2] }));
  if (!items.length) continue;

  const anchor = (n, h) => `#${n}-${h.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s/g, "-")}`;
  let out = `${title}\n\n${desc}\n\n> Consolidated from ${items.length} source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.\n\n## Contents\n\n`;
  out += items.map((it, i) => `${i + 1}. [${it.heading}](${anchor(i + 1, it.heading)}) — \`${it.src}\``).join("\n") + "\n";
  for (const [i, it] of items.entries()) {
    if (!existsSync(it.src)) { console.error(`missing source: ${it.src} (listed in ${file})`); process.exit(2); }
    out += `\n---\n\n## ${i + 1}. ${it.heading}\n\n> Source: \`${it.src}\`\n\n${nest(readFileSync(it.src, "utf8").replace(/\s+$/, ""))}\n`;
  }
  if (out !== old) {
    stale++;
    if (!check) writeFileSync(path, out);
    console.log(`${check ? "OUT OF DATE" : "updated"}: ${path}`);
  }
}
if (check && stale) { console.error(`\n${stale} consolidated chapter(s) are stale. Run: npm run docs:consolidate`); process.exit(1); }
console.log(stale ? `${stale} chapter(s) rewritten.` : "docs-consolidated is up to date.");
