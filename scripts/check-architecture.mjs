import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["apps", "packages"].map((directory) => path.join(repositoryRoot, directory));
const environmentBoundaries = new Set([
  "apps/web/src/config/server.ts",
  "packages/db/src/runtime-config.ts",
]);
const violations = [];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist", "build", "coverage"].includes(entry.name)) return [];
      return sourceFiles(target);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) && entry.name !== "next-env.d.ts"
      ? [target]
      : [];
  });
}

function location(source, node) {
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${path.relative(repositoryRoot, source.fileName)}:${point.line + 1}:${point.character + 1}`;
}

function report(source, node, message) {
  violations.push(`${location(source, node)} ${message}`);
}

function isRuntimeSource(relativePath) {
  return relativePath.includes("/src/") && !relativePath.includes("/test/");
}

function isUiModule(relativePath) {
  const appUi = relativePath.startsWith("apps/web/src/app/") && !relativePath.startsWith("apps/web/src/app/api/");
  return appUi || relativePath.startsWith("apps/web/src/components/") || relativePath.startsWith("apps/web/src/features/");
}

function isNetworkBoundary(relativePath) {
  return /\/api\.ts$/.test(relativePath) || relativePath === "apps/web/src/lib/api-client.ts";
}

function moduleSpecifier(node) {
  return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
}

for (const file of sourceRoots.flatMap(sourceFiles)) {
  const relativePath = path.relative(repositoryRoot, file).split(path.sep).join("/");
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  if (isRuntimeSource(relativePath)) {
    const credentialPattern = /(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/;
    if (credentialPattern.test(text)) {
      violations.push(`${relativePath}:1:1 possible credential literal in runtime source`);
    }
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword && isRuntimeSource(relativePath)) {
      report(source, node, "explicit any is forbidden; use unknown and narrow it");
    }

    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      node.getText(source).startsWith("process.env") &&
      !environmentBoundaries.has(relativePath)
    ) {
      report(source, node, "read environment variables through the typed runtime-config boundary");
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      isUiModule(relativePath) &&
      !isNetworkBoundary(relativePath)
    ) {
      report(source, node, "UI modules must call a feature api.ts function instead of fetch directly");
    }

    if (ts.isImportDeclaration(node)) {
      const imported = moduleSpecifier(node);
      const browserLayer = relativePath.startsWith("apps/web/src/features/") || relativePath.startsWith("apps/web/src/components/");
      if (
        browserLayer &&
        (/^@cnpaf\/db(?:\/|$)/.test(imported) || /^@\/lib\/(?:db|modules|ai|ai-workflows|storage|session)(?:\/|$)/.test(imported))
      ) {
        report(source, node, `browser layer cannot import server module ${imported}`);
      }
      if (browserLayer && imported.startsWith("node:")) {
        report(source, node, `browser layer cannot import Node.js module ${imported}`);
      }
    }

    if (
      isRuntimeSource(relativePath) &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /^https?:\/\//i.test(node.text)
    ) {
      report(source, node, "external runtime URLs belong in typed configuration, not source literals");
    }

    if (
      isRuntimeSource(relativePath) &&
      relativePath !== "packages/shared/src/i18n.ts" &&
      ts.isPropertyAssignment(node)
    ) {
      const name = node.name.getText(source).replace(/["']/g, "");
      if (
        /^(?:apiKey|password|secret|token|credential)$/i.test(name) &&
        (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
        node.initializer.text.length > 0
      ) {
        report(source, node, `non-empty ${name} literals are forbidden in runtime source`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (violations.length) {
  console.error("Architecture and hardcode checks failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Architecture and hardcode checks passed.");
