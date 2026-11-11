import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, relative, extname } from "node:path";
import { stripTypeScriptTypes, isBuiltin } from "node:module";
import { SourceTextModule } from "node:vm";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const declared = new Set([
  ...Object.keys(manifest.dependencies),
  ...Object.keys(manifest.devDependencies),
]);
function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => ![".git", "node_modules", "dist"].includes(entry.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? inventory(resolve(directory, entry.name))
        : [resolve(directory, entry.name)],
    );
}
const files = inventory(root);
let parsed = 0;
let jsxSkipped = 0;
let refs = 0;
let links = 0;
const failures = [];
for (const path of files) {
  const extension = extname(path);
  if (extension === ".svg") continue;
  const source = readFileSync(path, "utf8");
  if (extension === ".json") {
    try {
      JSON.parse(source);
    } catch {
      failures.push(`${relative(root, path)}: invalid JSON`);
    }
  }
  if ([".ts", ".js", ".mjs"].includes(extension)) {
    try {
      new SourceTextModule(
        extension === ".ts"
          ? stripTypeScriptTypes(source, { mode: "transform" })
          : source,
        { identifier: path },
      );
      parsed++;
    } catch (error) {
      failures.push(`${relative(root, path)}: ${error.message}`);
    }
  }
  if (extension === ".tsx") jsxSkipped++;
  if ([".ts", ".tsx", ".js", ".mjs"].includes(extension)) {
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g,
    )) {
      const target = match[1];
      refs++;
      if (target.startsWith(".")) {
        const base = resolve(dirname(path), target);
        const bare = base.replace(/\.js$/, "");
        if (
          ![
            base,
            `${base}.ts`,
            `${base}.tsx`,
            `${bare}.ts`,
            `${bare}.tsx`,
          ].some((file) => existsSync(file) && statSync(file).isFile())
        )
          failures.push(`${relative(root, path)}: missing ${target}`);
      } else if (!isBuiltin(target)) {
        const name = target.startsWith("@")
          ? target.split("/").slice(0, 2).join("/")
          : target.split("/")[0];
        if (!declared.has(name) && !declared.has(`@types/${name}`))
          failures.push(`${relative(root, path)}: undeclared ${name}`);
      }
    }
  }
  if (extension === ".md")
    for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      links++;
      if (!existsSync(resolve(dirname(path), target.split("#")[0])))
        failures.push(`${relative(root, path)}: missing doc link ${target}`);
    }
}
console.log(
  JSON.stringify(
    {
      status: failures.length ? "FAIL" : "PARTIAL",
      files: files.length,
      parsed,
      jsxSkipped,
      literalModuleReferences: refs,
      localDocumentLinks: links,
      failures,
      limitations: [
        "This script does not perform TypeScript typechecking, JSX parsing, ESLint, Prettier or SQL parsing.",
        "Literal references do not prove exports, runtime routes or cryptographic correctness.",
        "No application module was imported, linked or evaluated.",
      ],
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 2;
