// src/core/utils/assetHealer.js
import fs from 'fs-extra';
import path from 'path';
import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../services/AstManager.js';
import { normalizePath, getRelativePath } from './pathUtils.js';
import { printStep, printSubStep, printWarning } from './ui.js';

const ASSET_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.json',
];

// دالة مساعدة لجمع كل الأصول الثابتة من القرص الصلب
async function buildAssetDictionary(dirPath, dictionary = new Map()) {
  const files = await fs.readdir(dirPath);
  for (const file of files) {
    if (file === 'node_modules' || file === '.expo') continue;

    const fullPath = normalizePath(path.join(dirPath, file));
    if ((await fs.stat(fullPath)).isDirectory()) {
      await buildAssetDictionary(fullPath, dictionary);
    } else {
      const ext = path.extname(fullPath).toLowerCase();
      if (ASSET_EXTENSIONS.includes(ext)) {
        const baseName = path.basename(fullPath); // e.g., 'logo.png'
        if (!dictionary.has(baseName)) dictionary.set(baseName, []);
        dictionary.get(baseName).push(fullPath);
      }
    }
  }
  return dictionary;
}

/**
 * Scans the project for broken references to static assets (images, fonts, JSON)
 * in both ESM imports and CommonJS requires.
 *
 * @param {string} targetProjectPath
 * @returns {Promise<{healedCount: number, manualCount: number}>}
 */
export async function fixBrokenAssets(targetProjectPath) {
  printStep(
    'Doctor — Scanning for broken static assets (Images, Fonts, JSON)...'
  );

  // 1. بناء قاموس الأصول الثابتة من القرص الصلب
  const assetDictionary = await buildAssetDictionary(targetProjectPath);
  const expoProject = AstManager.getExpoProject(targetProjectPath);
  const sourceFiles = expoProject.getSourceFiles();

  let healedCount = 0;
  let manualCount = 0;
  const report = [];

  // دالة المعالجة الداخلية لتجنب التكرار
  function processAssetPath(
    moduleSpecifier,
    currentDir,
    dictionary,
    filePath,
    projectPath,
    reportArray,
    updateFn
  ) {
    if (!moduleSpecifier.startsWith('.')) return false;

    const targetPath = normalizePath(path.resolve(currentDir, moduleSpecifier));
    if (fs.existsSync(targetPath)) return false; // المسار سليم

    const fileName = path.basename(moduleSpecifier);
    const potentialMatches = dictionary.get(fileName);

    if (potentialMatches && potentialMatches.length === 1) {
      const correctAbsolutePath = potentialMatches[0];
      let newRelativePath = getRelativePath(currentDir, correctAbsolutePath);
      if (!newRelativePath.startsWith('.'))
        newRelativePath = `./${newRelativePath}`;

      updateFn(newRelativePath);
      healedCount++;
      const displayPath = filePath.replace(normalizePath(projectPath), '');
      reportArray.push(
        `[✔] Asset Healed: '${displayPath}' -> Updated to '${newRelativePath}'`
      );
      return true;
    } else {
      manualCount++;
      const displayPath = filePath.replace(normalizePath(projectPath), '');
      reportArray.push(
        `[⚠] Manual Fix Required: '${displayPath}' -> Could not resolve asset '${moduleSpecifier}'`
      );
      return false;
    }
  }

  // 2. الفحص والإصلاح
  for (const sourceFile of sourceFiles) {
    const fileAbsolutePath = normalizePath(sourceFile.getFilePath());
    const currentDir = path.dirname(fileAbsolutePath);
    let fileModified = false;

    // A. فحص الـ Imports العادية (import logo from './logo.png')
    const imports = sourceFile.getImportDeclarations();
    for (const importDecl of imports) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (ASSET_EXTENSIONS.some((ext) => moduleSpecifier.endsWith(ext))) {
        fileModified =
          processAssetPath(
            moduleSpecifier,
            currentDir,
            assetDictionary,
            fileAbsolutePath,
            targetProjectPath,
            report,
            (newPath) => {
              importDecl.setModuleSpecifier(newPath);
            }
          ) || fileModified;
      }
    }

    // B. فحص الـ Require (<Image source={require('./logo.png')} />)
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );
    for (const callExpr of callExpressions) {
      const expr = callExpr.getExpression();
      if (
        expr.getKind() === SyntaxKind.Identifier &&
        expr.getText() === 'require'
      ) {
        const args = callExpr.getArguments();
        if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
          const moduleSpecifier = args[0].getLiteralValue();
          if (ASSET_EXTENSIONS.some((ext) => moduleSpecifier.endsWith(ext))) {
            fileModified =
              processAssetPath(
                moduleSpecifier,
                currentDir,
                assetDictionary,
                fileAbsolutePath,
                targetProjectPath,
                report,
                (newPath) => {
                  // تعديل مسار الـ require في الـ AST
                  args[0].replaceWithText(`'${newPath}'`);
                }
              ) || fileModified;
          }
        }
      }
    }

    if (fileModified) sourceFile.saveSync();
  }

  if (report.length > 0) {
    console.log('\n🖼️ Inspecting Static Assets...');
    report.forEach((line) => {
      if (line.includes('[✔]')) printSubStep(line, 1);
      else printWarning(line);
    });
  } else {
    printSubStep('[✔] All static asset references are valid.', 1);
  }

  return { healedCount, manualCount };
}
