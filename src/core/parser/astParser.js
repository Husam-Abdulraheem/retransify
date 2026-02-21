// src/core/astParser.js
import fs from 'fs/promises';
import path from 'path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

/**
 * Parser configuration
 */
const PARSER_CONFIG = {
  sourceType: 'module',
  plugins: [
    'jsx',
    'typescript',
    'classProperties',
    'objectRestSpread',
    'optionalChaining',
    'nullishCoalescingOperator',
    'decorators-legacy',
  ],
};

/**
 * Parse a single file and extract:
 * - imports
 * - exports
 * - components
 * - hooks
 * - JSX info
 */
export async function parseFile(filePath) {
  const code = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath);

  // [Fix] Only parse JS/TS files
  if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    return {
      filePath,
      imports: [],
      exports: [],
      hasJSX: false,
      components: [],
      hooks: [],
      raw: code,
      ast: null,
      skipped: true,
    };
  }

  try {
    const ast = parse(code, PARSER_CONFIG);

    const result = {
      filePath,
      imports: [],
      exports: [],
      hasJSX: false,
      components: [],
      hooks: [],
      raw: code,
      ast: ast, // [Enhanced] Return raw AST for Deep Scan
    };

    // Continue traversing...
    traverse(ast, {
      /**
       * Extract all imports
       */
      ImportDeclaration(path) {
        const item = {
          source: path.node.source.value,
          loc: path.node.loc, // [Enhanced] Location for Healer
          specifiers: [],
        };

        path.node.specifiers.forEach((s) => {
          // [Enhanced] Scope Analysis for Usage Count
          const localName = s.local.name;
          const binding = path.scope.getBinding(localName);
          const usageCount = binding ? binding.referencePaths.length : 0;

          const specifierData = {
            local: localName,
            loc: s.loc, // [Enhanced] Location per specifier
            usageCount: usageCount, // [Enhanced] Smart Usage Count
          };

          if (s.type === 'ImportDefaultSpecifier') {
            item.specifiers.push({
              type: 'default',
              imported: 'default',
              ...specifierData,
            });
          } else if (s.type === 'ImportSpecifier') {
            item.specifiers.push({
              type: 'named',
              imported: s.imported.name,
              ...specifierData,
            });
          } else if (s.type === 'ImportNamespaceSpecifier') {
            item.specifiers.push({
              type: 'namespace',
              ...specifierData,
            });
          }
        });

        result.imports.push(item);
      },

      /**
       * Detect JSX structures
       */
      JSXElement() {
        result.hasJSX = true;
      },
      JSXFragment() {
        result.hasJSX = true;
      },

      /**
       * Detect exports (default & named)
       */
      ExportDefaultDeclaration(path) {
        const name = extractExportName(path.node);

        // Calculate usage if possible (often 0 for default exports unless used internally)
        let usageCount = 0;
        if (
          name &&
          name !== 'AnonymousComponent' &&
          name !== 'UnknownDefaultExport'
        ) {
          const binding = path.scope.getBinding(name);
          usageCount = binding ? binding.referencePaths.length : 0;
        }

        result.exports.push({
          type: 'default',
          name: name,
          loc: path.node.loc,
          usageCount: usageCount,
        });
      },

      ExportNamedDeclaration(path) {
        if (path.node.declaration) {
          if (path.node.declaration.id) {
            // export const foo = ...
            const name = path.node.declaration.id.name;
            const binding = path.scope.getBinding(name);
            const usageCount = binding ? binding.referencePaths.length : 0;

            result.exports.push({
              type: 'named',
              name: name,
              loc: path.node.declaration.loc, // [Enhanced] Location
              usageCount: usageCount, // [Enhanced] Usage Count
            });
          } else if (path.node.declaration.declarations) {
            // export const a = 1, b = 2;
            path.node.declaration.declarations.forEach((decl) => {
              if (decl.id.name) {
                const name = decl.id.name;
                const binding = path.scope.getBinding(name);
                const usageCount = binding ? binding.referencePaths.length : 0;

                result.exports.push({
                  type: 'named',
                  name: name,
                  loc: decl.loc,
                  usageCount: usageCount,
                });
              }
            });
          }
        }

        if (path.node.specifiers) {
          // export { foo, bar }
          path.node.specifiers.forEach((s) => {
            const localName = s.local.name;
            const binding = path.scope.getBinding(localName);
            const usageCount = binding ? binding.referencePaths.length : 0;

            result.exports.push({
              type: 'named',
              name: s.exported.name,
              local: localName,
              loc: s.loc,
              usageCount: usageCount,
            });
          });
        }
      },

      /**
       * Detect function components
       * e.g.:
       * function Button() { return <div/> }
       * or:
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
          (path.node.init.type === 'ArrowFunctionExpression' ||
            path.node.init.type === 'FunctionExpression')
        ) {
          if (isReactComponent(path.node.init)) {
            result.components.push(path.node.id.name);
          }
        }
      },

      /**
       * Detect hook usage
       */
      CallExpression(path) {
        if (path.node.callee.type === 'Identifier') {
          const name = path.node.callee.name;
          if (name.startsWith('use')) {
            result.hooks.push(name);
          }
        }
      },
    });

    return result;
  } catch (error) {
    console.warn(
      `⚠️  Parser missed file: ${path.basename(filePath)} (${error.code || 'SyntaxError'})`
    );
    // Return empty safe object
    return {
      filePath,
      imports: [],
      exports: [],
      hasJSX: false,
      components: [],
      hooks: [],
      raw: code,
      ast: null,
      error: error.message,
    };
  }
}

/**
 * Determines if a function is a React Component:
 * - Starts with uppercase letter
 * - Contains JSX
 */
function isReactComponent(node) {
  if (!node.body) return false;
  if (!node.id && node.type !== 'FunctionExpression') return false;

  // Component name must start with uppercase
  const name = node.id?.name;
  if (!name) return false;
  if (name[0] !== name[0].toUpperCase()) return false;

  // Does return contain JSX?
  let containsJSX = false;
  traverse(
    node,
    {
      JSXElement() {
        containsJSX = true;
      },
      JSXFragment() {
        containsJSX = true;
      },
    },
    node
  );

  return containsJSX;
}

/**
 * Extract default export name
 */
function extractExportName(node) {
  if (!node.declaration) return null;

  // export default function Button() {}
  if (node.declaration.id) {
    return node.declaration.id.name;
  }

  // export default () => {}
  if (node.declaration.type === 'ArrowFunctionExpression') {
    return 'AnonymousComponent';
  }

  // export default ComponentName
  if (node.declaration.type === 'Identifier') {
    return node.declaration.name;
  }

  return 'UnknownDefaultExport';
}
