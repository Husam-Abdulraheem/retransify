// src/core/astParser.js
import fs from "fs/promises";
import path from "path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default;


/**
 * إعدادات الـ parser
 */
const PARSER_CONFIG = {
  sourceType: "module",
  plugins: [
    "jsx",
    "typescript",
    "classProperties",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "decorators-legacy"
  ]
};

/**
 * تحليل ملف واحد واستخراج:
 * - imports
 * - exports
 * - components
 * - hooks
 * - معلومات الـ JSX
 */
export async function parseFile(filePath) {
  const code = await fs.readFile(filePath, "utf-8");

  const ast = parse(code, PARSER_CONFIG);

  const result = {
    filePath,
    imports: [],
    exports: [],
    hasJSX: false,
    components: [],
    hooks: [],
    raw: code
  };

  traverse(ast, {
    /**
     * استخراج جميع imports
     */
    ImportDeclaration(path) {
      const item = {
        source: path.node.source.value,
        specifiers: []
      };

      path.node.specifiers.forEach((s) => {
        if (s.type === "ImportDefaultSpecifier") {
          item.specifiers.push({
            type: "default",
            imported: "default",
            local: s.local.name
          });
        } else if (s.type === "ImportSpecifier") {
          item.specifiers.push({
            type: "named",
            imported: s.imported.name,
            local: s.local.name
          });
        } else if (s.type === "ImportNamespaceSpecifier") {
          item.specifiers.push({
            type: "namespace",
            local: s.local.name
          });
        }
      });

      result.imports.push(item);
    },

    /**
     * كشف هياكل JSX
     */
    JSXElement() {
      result.hasJSX = true;
    },
    JSXFragment() {
      result.hasJSX = true;
    },

    /**
     * كشف الـ exports (default & named)
     */
    ExportDefaultDeclaration(path) {
      result.exports.push({
        type: "default",
        name: extractExportName(path.node)
      });
    },

    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        if (path.node.declaration.id) {
          result.exports.push({
            type: "named",
            name: path.node.declaration.id.name
          });
        }
      }

      if (path.node.specifiers) {
        path.node.specifiers.forEach((s) => {
          result.exports.push({
            type: "named",
            name: s.exported.name
          });
        });
      }
    },

    /**
     * كشف الـ function components
     * مثلاً:
     * function Button() { return <div/> }
     * أو:
     * const Button = () => <div/>
     */
    FunctionDeclaration(path) {
      if (isReactComponent(path.node)) {
        result.components.push(path.node.id.name);
      }
    },

    VariableDeclarator(path) {
      if (
        path.node.init &&
        (path.node.init.type === "ArrowFunctionExpression" ||
          path.node.init.type === "FunctionExpression")
      ) {
        if (isReactComponent(path.node.init)) {
          result.components.push(path.node.id.name);
        }
      }
    },

    /**
     * كشف استخدام hooks
     */
    CallExpression(path) {
      if (path.node.callee.type === "Identifier") {
        const name = path.node.callee.name;
        if (name.startsWith("use")) {
          result.hooks.push(name);
        }
      }
    }
  });

  return result;
}

/**
 * يحدد إن كان function React Component:
 * - يبدأ بحرف كبير
 * - يحتوي JSX
 */
function isReactComponent(node) {
  if (!node.body) return false;
  if (!node.id && node.type !== "FunctionExpression") return false;

  // اسم الكبوننت يجب أن يبدأ بحرف كبير
  const name = node.id?.name;
  if (!name) return false;
  if (name[0] !== name[0].toUpperCase()) return false;

  // هل يحتوي return JSX؟
  let containsJSX = false;
  traverse(
    node,
    {
      JSXElement() {
        containsJSX = true;
      },
      JSXFragment() {
        containsJSX = true;
      }
    },
    node
  );

  return containsJSX;
}

/**
 * استخراج اسم الـ export default
 */
function extractExportName(node) {
  if (!node.declaration) return null;

  // export default function Button() {}
  if (node.declaration.id) {
    return node.declaration.id.name;
  }

  // export default () => {}
  if (node.declaration.type === "ArrowFunctionExpression") {
    return "AnonymousComponent";
  }

  // export default ComponentName
  if (node.declaration.type === "Identifier") {
    return node.declaration.name;
  }

  return "UnknownDefaultExport";
}
