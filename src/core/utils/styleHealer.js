// src/core/utils/styleHealer.js
import path from 'path';
import fs from 'fs-extra';
import { AstManager } from '../services/AstManager.js';
import { normalizePath } from './pathUtils.js';
import { printSubStep } from './ui.js';

/**
 * Ensures that the global.css import is present in the root layout file.
 * This is the deterministic way to handle NativeWind v4 setup using AST.
 *
 * @param {string} targetProjectPath
 * @param {string} styling - Styling system (e.g., 'NativeWind')
 */
export async function fixStyleImports(targetProjectPath, styling) {
  if (styling !== 'NativeWind' && styling !== 'Tailwind')
    return { healed: false };

  const expoProject = AstManager.getExpoProject(targetProjectPath);
  const possiblePaths = [
    normalizePath(path.join(targetProjectPath, 'app/_layout.tsx')),
    normalizePath(path.join(targetProjectPath, 'app/_layout.js')),
    normalizePath(path.join(targetProjectPath, 'app/_layout.jsx')),
  ];

  let rootLayoutPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      rootLayoutPath = p;
      break;
    }
  }

  if (!rootLayoutPath) return { healed: false };

  // Ensure the file is in the project
  let sourceFile = expoProject.getSourceFile(rootLayoutPath);
  if (!sourceFile) {
    sourceFile = expoProject.addSourceFileAtPath(rootLayoutPath);
  }

  const importValue = '../global.css';
  const existingImport = sourceFile.getImportDeclaration(
    (i) => i.getModuleSpecifierValue() === importValue
  );

  if (!existingImport) {
    // Inject the import at the top
    sourceFile.addImportDeclaration({
      moduleSpecifier: importValue,
    });
    sourceFile.saveSync();
    printSubStep(
      `[✔] Style Healer: Injected global.css import into _layout.tsx (Deterministic AST)`
    );
    return { healed: true };
  }

  return { healed: false };
}
