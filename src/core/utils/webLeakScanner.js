// src/core/utils/webLeakScanner.js
import fs from 'fs-extra';
import path from 'path';
import { printStep, printSubStep, printWarning } from './ui.js';
import { normalizePath } from './pathUtils.js';

// دالة مساعدة لجلب كل الملفات برمجياً بدون مكتبات خارجية
async function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = await fs.readdir(dirPath);
  for (const file of files) {
    // تجاهل المجلدات الثقيلة
    if (file === 'node_modules' || file === '.expo' || file === 'assets')
      continue;

    const fullPath = path.join(dirPath, file);
    if ((await fs.stat(fullPath)).isDirectory()) {
      arrayOfFiles = await getAllFiles(fullPath, arrayOfFiles);
    } else {
      if (fullPath.match(/\.(tsx|ts|jsx|js)$/)) {
        arrayOfFiles.push(fullPath);
      }
    }
  }
  return arrayOfFiles;
}

export async function checkWebLeakage(targetProjectPath) {
  printStep('Doctor — Scanning for Web-Leakage (HTML/DOM elements)...');

  const allFiles = await getAllFiles(targetProjectPath);
  let leakCount = 0;

  // Regex لاصطياد أشهر عناصر الويب الممنوعة
  const webPatterns = [
    { regex: /<\s*div\b/g, name: '<div> tag' },
    { regex: /<\s*span\b/g, name: '<span> tag' },
    { regex: /<\s*img\b/g, name: '<img> tag' },
    { regex: /<\s*a\b[^>]*>/g, name: '<a> tag' },
    { regex: /\bwindow\./g, name: 'window object' },
    { regex: /\bdocument\./g, name: 'document object' },
    { regex: /\blocalStorage\./g, name: 'localStorage' },
  ];

  for (const file of allFiles) {
    const content = await fs.readFile(file, 'utf-8');
    const relativeFilePath = normalizePath(file).replace(
      normalizePath(targetProjectPath),
      ''
    );

    for (const pattern of webPatterns) {
      if (pattern.regex.test(content)) {
        printWarning(
          `[⚠] Web Leakage: Found '${pattern.name}' inside '${relativeFilePath}'. This will crash the app.`
        );
        leakCount++;
        break; // نكتفي بذكر أول تسريب في الملف لعدم إزعاج المطور
      }
    }
  }

  if (leakCount === 0) {
    printSubStep(
      '[✔] Web Leakage: No raw HTML elements or DOM objects found.',
      1
    );
  }

  return leakCount === 0;
}
