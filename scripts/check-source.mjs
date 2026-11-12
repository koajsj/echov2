import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
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
// Author files, including untracked changes. Generated build/dependency artifacts
// follow Git's existing ignore boundary, exactly as the deliverable file set does.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .map((file) => resolve(root, file));
let parsed = 0;
let jsxParsed = 0;
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
  if (extension === ".tsx") {
    const syntax = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    for (const diagnostic of syntax.parseDiagnostics)
      failures.push(
        `${relative(root, path)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    jsxParsed++;
  }
  if ([".ts", ".tsx", ".js", ".mjs"].includes(extension)) {
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g,
    )) {
      const target = match[1];
      refs++;
      if (target.startsWith(".") || target.startsWith("/")) {
        // Root-relative imports inside browser evaluation use Vite's repository root.
        const base = target.startsWith("/")
          ? resolve(root, "." + target)
          : resolve(dirname(path), target);
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
      status: failures.length ? "FAIL" : "PASS",
      files: files.length,
      parsed,
      jsxParsed,
      literalModuleReferences: refs,
      localDocumentLinks: links,
      failures,
      limitations: [
        "This script checks author-file syntax, literal references and local documentation links; not TypeScript types, ESLint, Prettier or SQL semantics.",
        "Literal references do not prove exports, runtime routes or cryptographic correctness.",
        "No application module was imported, linked or evaluated.",
      ],
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
