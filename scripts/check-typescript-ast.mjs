// Static parsing only: never imports/evaluates the application, emits code or runs tests.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ts = (
  await import(
    process.argv[2]
      ? pathToFileURL(path.resolve(process.argv[2])).href
      : "typescript"
  )
).default;
const root = path.resolve(import.meta.dirname, "..");
function inventory(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !["node_modules", ".git", "dist"].includes(entry.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? inventory(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
const files = inventory(root).filter((file) => /\.(ts|tsx)$/.test(file));
const errors = [];
const sources = new Map();
let localBindings = 0;
for (const file of files) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  sources.set(file, source);
  for (const diagnostic of source.parseDiagnostics) {
    const position = source.getLineAndCharacterOfPosition(
      diagnostic.start || 0,
    );
    errors.push(
      `${path.relative(root, file)}:${position.line + 1}:${position.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    );
  }
}
function exportedNames(source) {
  const names = new Set();
  for (const node of source.statements) {
    const modifiers = ts.getCombinedModifierFlags(node);
    if (modifiers & ts.ModifierFlags.Default) names.add("default");
    if (modifiers & ts.ModifierFlags.Export) {
      if (node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
      if (ts.isVariableStatement(node))
        for (const declaration of node.declarationList.declarations)
          if (ts.isIdentifier(declaration.name))
            names.add(declaration.name.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    )
      for (const item of node.exportClause.elements) names.add(item.name.text);
  }
  return names;
}
for (const [file, source] of sources) {
  for (const node of source.statements) {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !node.moduleSpecifier.text.startsWith(".")
    )
      continue;
    const base = path
      .resolve(path.dirname(file), node.moduleSpecifier.text)
      .replace(/\.js$/, "");
    const target = [base, base + ".ts", base + ".tsx"].find((candidate) =>
      sources.has(candidate),
    );
    if (!target || !node.importClause) continue;
    const names = exportedNames(sources.get(target));
    const clause = node.importClause;
    const requested = [];
    if (clause.name) requested.push("default");
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
      for (const item of clause.namedBindings.elements)
        requested.push((item.propertyName || item.name).text);
    for (const name of requested) {
      localBindings++;
      if (!names.has(name))
        errors.push(
          `${path.relative(root, file)}: missing named export ${name} in ${path.relative(root, target)}`,
        );
    }
  }
}
console.log(
  JSON.stringify(
    {
      status: errors.length ? "PARTIAL" : "PASS",
      typescript: ts.version,
      files: files.length,
      localBindings,
      errors,
      scope:
        "TS/TSX syntax and direct local named exports only; no types, package exports, SQL or runtime validation",
    },
    null,
    2,
  ),
);
process.exitCode = errors.length ? 1 : 0;
