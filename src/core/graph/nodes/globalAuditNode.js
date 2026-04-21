import path from 'path';
import { normalizePath, getRelativePath } from '../../utils/pathUtils.js';
import { AstManager } from '../../services/AstManager.js';
import { printStep, printWarning } from '../../utils/ui.js';

export async function globalAuditNode(state) {
  printStep('Global Audit — running final cross-file validation');

  const { targetProjectPath, unresolvedErrors = [] } = state;

  // 1. جلب مشروع إكسبو من الذاكرة الحية (الذي يحتوي الآن على كل الملفات المحولة)
  const expoProject = AstManager.getExpoProject(targetProjectPath);

  // 2. تشغيل فحص المترجم الشامل (Full TypeScript Compiler Check)
  const diagnostics = expoProject.getPreEmitDiagnostics();

  let newGlobalErrors = 0;
  const newErrorsFound = [];

  for (const diagnostic of diagnostics) {
    // نلتقط الأخطاء القاتلة فقط (Errors) ونتجاهل التحذيرات (Warnings)
    if (diagnostic.getCategory() === 1) {
      const sourceFile = diagnostic.getSourceFile();
      const filePath = sourceFile
        ? sourceFile.getFilePath()
        : 'Global Project Configuration';
      const message =
        typeof diagnostic.getMessageText() === 'string'
          ? diagnostic.getMessageText()
          : diagnostic.getMessageText().getMessageText();

      // التحقق مما إذا كان هذا الملف موجوداً مسبقاً في التقرير لتجنب التكرار
      const isAlreadyReported = unresolvedErrors.some((err) =>
        err.filePath.includes(filePath)
      );

      if (!isAlreadyReported) {
        newErrorsFound.push({
          filePath: getRelativePath(targetProjectPath, filePath),
          reason: `Global Cross-File Error: ${message}`,
          codeSnippet: sourceFile
            ? '// Manual review required due to strict compiler error.'
            : 'N/A',
          suggestedAction:
            'Check imports, exports, and props mismatch across files.',
        });
      }
    }
  }

  if (newErrorsFound.length > 0) {
    printWarning(
      `Global Audit found ${newErrorsFound.length} cross-file errors. Added to final report.`
    );
  }

  // تحديث الـ state ليرثها reporterNode ( LangGraph reducer handles appending)
  return { unresolvedErrors: newErrorsFound };
}
