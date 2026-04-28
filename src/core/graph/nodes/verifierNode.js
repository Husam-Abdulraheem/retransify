// src/core/graph/nodes/verifierNode.js
import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../../services/AstManager.js';
import { printStep, printSubStep, printWarning } from '../../utils/ui.js';
import { resolveAbsolutePath, normalizePath } from '../../utils/pathUtils.js';
import path from 'path';
import { SemanticVerifier } from '../../scanners/SemanticVerifier.js';

/**
 * VerifierNode - Audits the generated React Native code using AST structural checks
 * and compiler diagnostics.
 */
export async function verifierNode(state) {
  const {
    currentFile,
    targetProjectPath,
    pathMap,
    installedPackages = [],
    generatedCode,
    healAttempts,
  } = state;

  const isRetry = (healAttempts || 0) > 0;

  if (!currentFile || !generatedCode) {
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const displayPath = normalizePath(filePath);

  if (!isRetry) {
    printStep(`Verifier — inspecting ${displayPath}`);
  }

  const missingDependencies = new Set();
  const errors = [];

  // 1. Determine Target Absolute Path (Crucial for node_modules resolution)
  const targetRelativePath = pathMap[filePath] || filePath;
  const targetAbsolutePath = resolveAbsolutePath(
    { relativeToProject: targetRelativePath },
    targetProjectPath
  );

  // 1. Fast Semantic Verification (Fail-Fast)
  const semanticErrors = SemanticVerifier.verify(
    generatedCode,
    targetRelativePath,
    state
  );

  if (semanticErrors.length > 0) {
    currentFile.needsHealing = true;
    currentFile.verificationErrors = semanticErrors;

    if (isRetry) {
      printSubStep(
        `Semantic Verification failed (${semanticErrors.length} errors)`,
        1
      );
    } else {
      printWarning(
        `Semantic Verification failed for ${displayPath} (${semanticErrors.length} errors)`
      );
    }

    return { errors: semanticErrors, missingDependencies: [] };
  }

  // 1b. Cross-File Contract Validation (Fail-Fast)
  // Uses the ContractRegistry populated during analysis to verify that every
  // call to an imported local function matches its defined signature.
  // Runs only when contractRegistry is available — never blocks the pipeline.
  if (state.contractRegistry) {
    try {
      // Create an isolated in-memory project for this check so we never
      // pollute the shared Expo ts-morph project with a half-converted file.
      const { Project: TsProject } = await import('ts-morph');
      const contractCheckProject = new TsProject({
        useInMemoryFileSystem: true,
      });
      const contractCheckFile = contractCheckProject.createSourceFile(
        'contract_check.tsx',
        generatedCode
      );

      const contractErrors = SemanticVerifier.verifyCallContracts(
        contractCheckFile,
        targetRelativePath,
        state
      );

      if (contractErrors.length > 0) {
        currentFile.needsHealing = true;
        currentFile.verificationErrors = contractErrors;

        if (isRetry) {
          printSubStep(
            `Contract Validation failed (${contractErrors.length} violation(s))`,
            1
          );
        } else {
          printWarning(
            `Contract Validation failed for ${displayPath} (${contractErrors.length} violation(s))`
          );
        }

        return { errors: contractErrors, missingDependencies: [] };
      }
    } catch (contractCheckErr) {
      // Non-fatal: contract check failure must never block the pipeline.
      printWarning(`Contract check skipped: ${contractCheckErr.message}`);
    }
  }

  // 🚨 3. حقن الكود الجديد (React Native) في المترجم بدلاً من الكود القديم!
  const sourceFile = AstManager.upsertExpoFile(
    targetAbsolutePath,
    generatedCode,
    targetProjectPath
  );

  // 3. Structural & Syntax Verification (Compiler Diagnostics)
  const diagnostics = sourceFile.getPreEmitDiagnostics();
  for (const diagnostic of diagnostics) {
    const message = diagnostic.getMessageText();
    const line = diagnostic.getLineNumber();
    const code = diagnostic.getCode();
    const msgText =
      typeof message === 'string' ? message : message.getMessageText();

    // [FIX] Catch missing modules (TS2307) and queue for AutoInstaller
    if (code === 2307) {
      const match = msgText.match(/Cannot find module '(.+?)'/);
      if (match) {
        const moduleName = match[1];

        if (
          !moduleName.startsWith('.') &&
          !moduleName.startsWith('/') &&
          !moduleName.startsWith('@/')
        ) {
          let basePkg = moduleName;
          if (moduleName.startsWith('@')) {
            const parts = moduleName.split('/');
            if (parts.length >= 2) basePkg = parts[0] + '/' + parts[1];
          } else {
            basePkg = moduleName.split('/')[0];
          }

          if (!installedPackages.includes(basePkg)) {
            missingDependencies.add(basePkg);
          }
        }
      }
      continue;
    }

    if (diagnostic.getCategory() === 1 /* Error */) {
      errors.push(`[TS${code} L${line || '?'}]: ${msgText}`);
    }
  }

  // 4. Prohibited Web Elements & Classes
  const prohibitedTailwindClasses = [
    'h-screen',
    'w-screen',
    'fixed',
    'grid',
    'hover:',
    'focus:',
    'cursor-',
    'active:',
  ];

  const jsxAttributes = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxAttribute
  );
  jsxAttributes.forEach((attr) => {
    // Defensive check: handle both JsxAttribute and potential JsxSpreadAttribute if any leaked
    const attrName =
      typeof attr.getName === 'function'
        ? attr.getName()
        : attr.getNameNode?.().getText();
    if (attrName === 'className' || attrName === 'style') {
      const initializer = attr.getInitializer();
      if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
        const classString = initializer.getLiteralText();
        prohibitedTailwindClasses.forEach((badClass) => {
          if (classString.includes(badClass)) {
            errors.push(
              `Line ${attr.getStartLineNumber()}: Unsupported web concept '${badClass}'.`
            );
          }
        });
      }
    }
  });

  // 4b. Strict Cross-File Type Diagnostics
  // Runs ONLY when all prior checks have passed (errors.length === 0).
  // Creates a fresh ephemeral strict ts-morph project, injects the generated
  // file plus TypeScript declaration stubs synthesized from ContractRegistry,
  // and runs the compiler to catch TS2345 (argument type mismatch) and
  // TS2554 (wrong number of arguments) that the lenient shared project misses.
  if (errors.length === 0 && state.contractRegistry) {
    try {
      const strictProject =
        AstManager.getStrictVerificationProject(targetProjectPath);

      // ── Add the generated file as the primary file to check ────────────
      strictProject.createSourceFile('__generated__.tsx', generatedCode, {
        overwrite: true,
      });

      // ── Inject TypeScript declaration stubs for each contract dep ──────
      // For each local import path that has registered contracts, we synthesize
      // a minimal .d.ts stub so the compiler knows the exact function signatures.
      // This is sufficient for TS2345/TS2554 — we don’t need the full body.
      const importDeclarations =
        strictProject
          .getSourceFile('__generated__.tsx')
          ?.getImportDeclarations() || [];

      for (const imp of importDeclarations) {
        const modulePath = imp.getModuleSpecifierValue();
        if (!modulePath.startsWith('.') && !modulePath.startsWith('@/'))
          continue;

        const resolvedPath = SemanticVerifier.resolveImportPath(
          modulePath,
          targetRelativePath
        );
        const contracts = state.contractRegistry.getFileContracts(resolvedPath);
        if (contracts.length === 0) continue;

        // Build a minimal .d.ts that declares each exported function with its
        // exact signature so the TS compiler can validate call-sites.
        const stubLines = contracts.map((c) => {
          const params = c.parameters
            .map((p) => {
              const name = p.isDestructured
                ? `__p${c.parameters.indexOf(p)}`
                : p.name.replace(/[{}\s,]/g, '_');
              const opt = p.isOptional ? '?' : '';
              return `${name}${opt}: ${p.type}`;
            })
            .join(', ');
          const keyword = c.isDefault ? 'export default' : 'export';
          return `${keyword} function ${c.isDefault ? '_default' : c.name}(${params}): ${c.returnType};`;
        });

        const stubFileName = resolvedPath.replace(/[/\\]/g, '_') + '.d.ts';
        strictProject.createSourceFile(stubFileName, stubLines.join('\n'), {
          overwrite: true,
        });

        // Remap the import path in the generated file to point at our stub.
        // We do this via a synthetic path mapping — use a separate re-write
        // of the import specifier in a cloned source file so we don’t mutate
        // the real generated code. Instead just add an ambient module declaration.
        strictProject.createSourceFile(
          `__ambient_${stubFileName}`,
          `declare module '${modulePath}' {\n${stubLines.join('\n')}\n}`,
          { overwrite: true }
        );
      }

      // ── Run strict diagnostics, filter to cross-file argument errors ────
      const strictDiagnostics =
        strictProject
          .getSourceFile('__generated__.tsx')
          ?.getPreEmitDiagnostics() || [];

      const CROSS_FILE_ERROR_CODES = new Set([
        2345, // Argument of type X is not assignable to parameter of type Y
        2554, // Expected N arguments, but got M
        2555, // Expected at least N arguments, but got M
      ]);

      const SUPPRESSED_CODES = new Set([
        2307, // Cannot find module (expected — stubs are in-memory)
        7016, // Could not find declaration file
        2304, // Cannot find name (expected for external RN types)
      ]);

      for (const diag of strictDiagnostics) {
        const code = diag.getCode();
        if (SUPPRESSED_CODES.has(code)) continue;
        if (!CROSS_FILE_ERROR_CODES.has(code)) continue;

        const message = diag.getMessageText();
        const msgText =
          typeof message === 'string' ? message : message.getMessageText();
        const line = diag.getLineNumber();
        errors.push(`[Strict TS${code} L${line || '?'}]: ${msgText}`);
      }

      if (errors.length > 0) {
        printWarning(
          `Strict type check found ${errors.length} cross-file error(s) in ${displayPath}`
        );
      }
    } catch (strictErr) {
      // Non-fatal: strict check failure must never block the pipeline.
      printWarning(`Strict type check skipped: ${strictErr.message}`);
    }
  }

  // 5. Update state
  if (errors.length > 0) {
    currentFile.needsHealing = true;

    currentFile.verificationErrors = errors;

    if (isRetry) {
      printSubStep(`Verification failed (${errors.length} errors)`, 1);
    } else {
      printWarning(
        `Verification failed for ${displayPath} (${errors.length} errors)`
      );
    }
  } else {
    currentFile.needsHealing = false;
    currentFile.verificationErrors = [];

    if (isRetry) {
      printSubStep(`Verified ✔`, 1);
    } else {
      printSubStep(`Verified: ${displayPath} ✔`, 1);
    }
  }

  if (missingDependencies.size > 0) {
    printSubStep(
      `Detected ${missingDependencies.size} missing libraries: ${Array.from(
        missingDependencies
      ).join(', ')}`,
      1
    );
  }

  return {
    errors,
    missingDependencies: Array.from(missingDependencies),
  };
}
