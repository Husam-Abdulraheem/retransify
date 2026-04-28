import fs from 'fs-extra';
import path from 'path';
import { AstManager } from '../services/AstManager.js';
import { normalizePath, getRelativePath } from './pathUtils.js';
import { printStep, printSubStep, printWarning, succeedSpinner } from './ui.js';

/**
 * Scans the entire Expo project for broken physical imports,
 * attempts to auto-resolve them using an AST Dictionary, and writes fixes to disk.
 *
 * @param {string} targetProjectPath - The absolute path to the Expo project
 * @returns {Promise<{healedCount: number, manualCount: number}>}
 */
export async function fixBrokenImports(targetProjectPath) {
  printStep('Doctor — Scanning for broken physical imports...');

  const expoProject = AstManager.getExpoProject(targetProjectPath);

  // 🚨 CRITICAL: We MUST add files to the project first, otherwise getSourceFiles() is empty.
  // We scan app/ directory (routing) and any other source directories.
  expoProject.addSourceFilesAtPaths([
    normalizePath(path.join(targetProjectPath, 'app/**/*.{ts,tsx,js,jsx}')),
    normalizePath(path.join(targetProjectPath, 'src/**/*.{ts,tsx,js,jsx}')),
  ]);

  const sourceFiles = expoProject.getSourceFiles();

  if (sourceFiles.length === 0) {
    printWarning(
      'No source files found to scan. Ensure the project path is correct and contains an "app" folder.'
    );
  }

  // 1. Build a Dictionary of all files for ultra-fast O(1) lookup
  const fileDictionary = new Map();

  for (const sf of sourceFiles) {
    const absPath = normalizePath(sf.getFilePath());
    const baseName = path.parse(absPath).name;

    // Smart indexing: If the file is named 'index', index it by its parent folder name
    const searchKey =
      baseName === 'index' ? path.basename(path.dirname(absPath)) : baseName;

    if (!fileDictionary.has(searchKey)) {
      fileDictionary.set(searchKey, []);
    }
    fileDictionary.get(searchKey).push(absPath);
  }

  let healedCount = 0;
  let manualCount = 0;
  const report = [];

  // 2. Scan and Auto-Heal
  for (const sourceFile of sourceFiles) {
    const fileAbsolutePath = normalizePath(sourceFile.getFilePath());
    const currentDir = path.dirname(fileAbsolutePath);
    const imports = sourceFile.getImportDeclarations();

    let fileModified = false;

    for (const importDecl of imports) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Handle relative imports and aliases
      const isRelative = moduleSpecifier.startsWith('.');
      const isAlias = moduleSpecifier.startsWith('@/');

      if (!isRelative && !isAlias) continue;

      let targetPath;
      if (isAlias) {
        // Resolve Alias (assuming @/ maps to project root)
        targetPath = normalizePath(
          path.resolve(targetProjectPath, moduleSpecifier.replace('@/', './'))
        );
      } else {
        targetPath = normalizePath(path.resolve(currentDir, moduleSpecifier));
      }

      // Physical validation against common extensions
      const extensions = [
        '',
        '.tsx',
        '.ts',
        '.js',
        '.jsx',
        '.css',
        '/index.tsx',
        '/index.ts',
        '/index.js',
      ];
      const isPathValid = extensions.some((ext) =>
        fs.existsSync(`${targetPath}${ext}`)
      );

      if (!isPathValid) {
        // Broken import detected. Start the Auto-Healer protocol.
        // Strip extension from specifier for dictionary lookup (e.g., 'Button.tsx' -> 'Button')
        const importedBaseName = path.parse(moduleSpecifier).name;
        const potentialMatches = fileDictionary.get(importedBaseName);

        if (potentialMatches && potentialMatches.length === 1) {
          // Exactly ONE match found -> Safe to auto-heal
          const correctAbsolutePath = potentialMatches[0];

          // Calculate the new path
          let newPath;
          if (isAlias) {
            // الحفاظ على الـ Alias عبر الحساب بالنسبة لجذر المشروع
            const relToRoot = normalizePath(
              path.relative(targetProjectPath, correctAbsolutePath)
            );
            newPath = `@/${relToRoot}`;
          } else {
            // المسار النسبي كالمعتاد
            newPath = getRelativePath(currentDir, correctAbsolutePath);
            if (!newPath.startsWith('.')) {
              newPath = `./${newPath}`;
            }
          }

          // Strip extensions for clean ES6 imports (only for code files, not assets if handled here)
          newPath = newPath.replace(/\.(tsx|ts|jsx|js)$/, '');

          importDecl.setModuleSpecifier(newPath);
          fileModified = true;
          healedCount++;

          const displayFilePath = fileAbsolutePath.replace(
            normalizePath(targetProjectPath),
            ''
          );
          report.push(
            `[✔] Healed: '${displayFilePath}' -> Updated to '${newPath}'`
          );
        } else {
          // Zero matches OR Multiple matches -> Manual intervention required
          manualCount++;
          const reason = !potentialMatches
            ? 'File missing from project'
            : 'Multiple files share this name';
          const displayFilePath = fileAbsolutePath.replace(
            normalizePath(targetProjectPath),
            ''
          );
          report.push(
            `[⚠] Manual Fix Required: '${displayFilePath}' -> Could not resolve '${moduleSpecifier}' (${reason})`
          );
        }
      }
    }

    if (fileModified) {
      sourceFile.saveSync();
    }
  }

  // 3. Output the diagnostic report
  if (report.length > 0) {
    report.forEach((line) => {
      if (line.includes('[✔]')) printSubStep(line, 1);
      else printWarning(line);
    });
  }

  succeedSpinner(
    `Treatment Complete: ${healedCount} imports auto-healed. ${manualCount} require manual attention.`
  );

  return { healedCount, manualCount };
}
