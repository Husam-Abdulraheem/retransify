import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'path';

export class SemanticVerifier {
  static verify(generatedCode, currentFileTargetPath, state) {
    const errors = [];
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('temp.tsx', generatedCode);

    // 1. Web DOM Leakage
    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    for (const elem of jsxElements) {
      const tagName = elem.getTagNameNode().getText();
      if (/^[a-z]/.test(tagName) && tagName !== 'fragment') {
        errors.push(
          `[Fatal Semantic Error]: Found Web DOM element '<${tagName}>'. React Native requires UpperCase components (e.g., View, Text).`
        );
      }
    }

    // 2. Strict Routing & Import Integrity
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const modulePath = imp.getModuleSpecifierValue();

      if (modulePath === 'react-router-dom') {
        errors.push(
          `[Fatal Semantic Error]: Found import from 'react-router-dom'. You MUST use 'expo-router' for navigation.`
        );
      }

      if (modulePath.startsWith('.') || modulePath.startsWith('@/')) {
        const isValid = this.checkIfPathExists(
          modulePath,
          currentFileTargetPath,
          state
        );

        if (!isValid) {
          errors.push(
            `[Fatal Import Error]: You tried to import from '${modulePath}'. NO SUCH FILE exists in the mobile architecture.`
          );
        }
      }
    }

    // 3. 🚨 Require() Validation (Images & Assets) 🚨
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );
    for (const callExpr of callExpressions) {
      const expression = callExpr.getExpression();

      if (expression.getText() === 'require') {
        const args = callExpr.getArguments();

        if (args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            const requiredPath = firstArg.getLiteralText();
            const isValid = this.checkIfPathExists(
              requiredPath,
              currentFileTargetPath,
              state
            );
            if (!isValid) {
              errors.push(
                `[Fatal Require Error]: require('${requiredPath}') refers to a non-existent asset or file. Check 'AVAILABLE ASSETS'.`
              );
            }
          } else {
            // 🚨 Metro Bundler Critical Failure: Dynamic require
            errors.push(
              `[Fatal Require Error]: Found dynamic require(${firstArg.getText()}). React Native (Metro) ONLY supports static string literals in require().`
            );
          }
        }
      }
    }

    return errors;
  }

  /**
   * Cross-file call contract validation.
   *
   * Walks every CallExpression in the generated file and checks whether the
   * arguments passed match the FunctionContract registered in ContractRegistry
   * for the imported function. Catches two classes of silent bugs:
   *
   *   1. Argument count mismatch — fewer arguments than required parameters.
   *   2. Destructured shape mismatch — function expects `{ key1, key2 }` but
   *      caller passes a non-object-literal single value (e.g., a variable),
   *      OR passes an object literal that is missing one or more expected keys.
   *
   * Both checks operate purely on AST structure — no type inference needed —
   * which keeps this fast and deterministic.
   *
   * @param {import('ts-morph').SourceFile} sourceFile - Already-created in-memory file
   * @param {string} targetRelativePath - Normalized project-relative path of this file
   * @param {object} state - GraphState (must contain contractRegistry and pathMap)
   * @returns {string[]} Array of error strings (empty = no contract violations)
   */
  static verifyCallContracts(sourceFile, targetRelativePath, state) {
    const errors = [];
    const { contractRegistry } = state;

    // Registry not yet populated (e.g., first file in the queue) — skip gracefully.
    if (!contractRegistry) return errors;

    // ── Step 1: Build a map of localImportName → FunctionContract ────────────
    // Key: the identifier used in this file (e.g. 'useCart', 'CartProvider')
    // Value: { contract: FunctionContract, fromFile: string }
    /** @type {Map<string, { contract: import('../graph/helpers/ContractRegistry.js').FunctionContract, fromFile: string }>} */
    const importedContracts = new Map();

    for (const imp of sourceFile.getImportDeclarations()) {
      const modulePath = imp.getModuleSpecifierValue();

      // Only track local imports — third-party packages have no contracts.
      if (!modulePath.startsWith('.') && !modulePath.startsWith('@/')) continue;

      const resolvedPath = this.resolveImportPath(
        modulePath,
        targetRelativePath
      );
      if (!resolvedPath) continue;

      // Named imports: import { useCart, CartProvider } from './useCart'
      for (const named of imp.getNamedImports()) {
        const localName = named.getAliasNode()
          ? named.getAliasNode().getText()
          : named.getName();
        const exportName = named.getName();
        const contract = contractRegistry.getContract(resolvedPath, exportName);
        if (contract) {
          importedContracts.set(localName, {
            contract,
            fromFile: resolvedPath,
          });
        }
      }

      // Default import: import useCart from './useCart'
      const defaultImport = imp.getDefaultImport();
      if (defaultImport) {
        const localName = defaultImport.getText();
        const contract = contractRegistry.getContract(resolvedPath, 'default');
        if (contract) {
          importedContracts.set(localName, {
            contract,
            fromFile: resolvedPath,
          });
        }
      }
    }

    if (importedContracts.size === 0) return errors;

    // ── Step 2: Walk all CallExpressions and validate against contracts ──────
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    )) {
      // Extract the callee name (handles simple identifiers and member access).
      const calleeText = call.getExpression().getText();
      const entry = importedContracts.get(calleeText);
      if (!entry) continue;

      const { contract, fromFile } = entry;
      const callArgs = call.getArguments();

      // ── Check 1: Argument count ──────────────────────────────────────────
      const requiredParams = contract.parameters.filter(
        (p) => !p.isOptional && p.defaultValue === null
      );
      if (callArgs.length < requiredParams.length) {
        errors.push(
          `[Contract Violation]: '${calleeText}()' imported from '${fromFile}' ` +
            `requires ${requiredParams.length} argument(s) but ${callArgs.length} were passed.`
        );
        // No point checking shape if count is already wrong.
        continue;
      }

      // ── Check 2: Destructured parameter shape ────────────────────────────
      for (
        let i = 0;
        i < Math.min(callArgs.length, contract.parameters.length);
        i++
      ) {
        const param = contract.parameters[i];
        if (!param.isDestructured || param.destructuredKeys.length === 0)
          continue;

        const arg = callArgs[i];
        const argKind = arg.getKind();

        if (argKind === SyntaxKind.ObjectLiteralExpression) {
          // Caller passed an object literal — check that all required keys exist.
          const passedKeys = new Set(
            arg
              .getProperties()
              .map((prop) => {
                // PropertyAssignment (key: val) or ShorthandPropertyAssignment (key)
                if (typeof prop.getName === 'function') return prop.getName();
                if (typeof prop.getNameNode === 'function')
                  return prop.getNameNode().getText();
                return null;
              })
              .filter(Boolean)
          );

          const missingKeys = param.destructuredKeys.filter(
            (k) => !passedKeys.has(k)
          );
          if (missingKeys.length > 0) {
            errors.push(
              `[Contract Violation]: '${calleeText}()' imported from '${fromFile}' ` +
                `expects { ${param.destructuredKeys.join(', ')} } but the object literal is missing key(s): ` +
                `{ ${missingKeys.join(', ')} }.`
            );
          }
        } else if (
          argKind !== SyntaxKind.ObjectLiteralExpression &&
          argKind !== SyntaxKind.SpreadElement
        ) {
          // Caller passed a non-object (e.g., a variable, string, number).
          // The function expects a destructured object — this is a signature mismatch.
          errors.push(
            `[Contract Violation]: '${calleeText}()' imported from '${fromFile}' ` +
              `expects a destructured object { ${param.destructuredKeys.join(', ')} } ` +
              `at argument ${i + 1}, but received a non-object value: '${arg.getText().slice(0, 60)}'.`
          );
        }
      }
    }

    return errors;
  }

  /**
   * Resolves a module specifier (relative or @/-aliased) to a normalized
   * project-relative path string, matching the same format used as keys in
   * ContractRegistry and ContextStore.
   *
   * Does NOT attempt extension resolution — ContractRegistry keys are stored
   * without extensions because they are registered from the source file's
   * relative path (which includes the extension). We strip extensions here to
   * allow fuzzy-matching both `./useCart` and `./useCart.js`.
   *
   * @param {string} modulePath - Import specifier (e.g., './hooks/useCart', '@/hooks/useCart')
   * @param {string} currentFilePath - Normalized project-relative path of the importing file
   * @returns {string|null} Normalized project-relative path, or null if unresolvable
   */
  static resolveImportPath(modulePath, currentFilePath) {
    let raw;
    if (modulePath.startsWith('@/')) {
      raw = modulePath.replace('@/', '');
    } else {
      const fileDir = path.posix.dirname(currentFilePath.replace(/\\/g, '/'));
      raw = path.posix.join(fileDir, modulePath);
    }
    return path.posix.normalize(raw);
  }

  static checkIfPathExists(modulePath, currentFileTargetPath, state) {
    let resolvedRaw;
    if (modulePath.startsWith('@/')) {
      resolvedRaw = modulePath.replace('@/', '');
    } else {
      const fileDir = path.posix.dirname(
        currentFileTargetPath.replace(/\\/g, '/')
      );
      resolvedRaw = path.posix.join(fileDir, modulePath);
    }

    resolvedRaw = path.posix.normalize(resolvedRaw);

    const allValidTargetPaths = Object.values(state.pathMap).map((p) =>
      p.replace(/\\/g, '/')
    );
    const extensions = [
      '',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '/index.js',
      '/index.jsx',
      '/index.ts',
      '/index.tsx',
    ];

    // Check code files
    for (const ext of extensions) {
      const candidate = resolvedRaw + ext;
      if (allValidTargetPaths.includes(candidate)) return true;
      if (
        modulePath.startsWith('@/') &&
        allValidTargetPaths.includes('src/' + candidate)
      )
        return true;
    }

    // Check assets (state.assetMap)
    if (state.assetMap) {
      const normalizedAssetPaths = Object.values(state.assetMap).map((p) =>
        p.replace(/\\/g, '/')
      );
      // Assets usually keep their extensions in require()
      if (normalizedAssetPaths.includes(resolvedRaw)) return true;

      // Deep search for assets (supporting sub-paths)
      for (const assetPath of normalizedAssetPaths) {
        if (assetPath === resolvedRaw || assetPath.startsWith(resolvedRaw)) {
          return true;
        }
      }
    }

    return false;
  }
}
