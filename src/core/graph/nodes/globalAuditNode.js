// src/core/graph/nodes/globalAuditNode.js
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { printStep, printWarning } from '../../utils/ui.js';
import { normalizePath } from '../../utils/pathUtils.js';

const execAsync = util.promisify(exec);

/**
 * GlobalAuditNode - Runs the actual TypeScript compiler (tsc) on the target project.
 * This provides 100% accurate diagnostics by considering node_modules and actual tsconfig.
 */
export async function globalAuditNode(state) {
  printStep('Global Audit — running native TypeScript compiler check');

  const { targetProjectPath, unresolvedErrors = [] } = state;
  const newErrorsFound = [];

  try {
    // 1. تشغيل المترجم الحقيقي الخاص بـ Expo
    // نستخدم --noEmit للتأكد من صحة الكود دون توليد ملفات JS
    await execAsync('npx tsc --noEmit', { cwd: targetProjectPath });

    // إذا نجح الأمر بدون أخطاء، ننتقل للخطوة التالية
  } catch (error) {
    // 2. تحليل مخرجات tsc في حالة وجود أخطاء (وهو المتوقع دائماً مع كود AI)
    const tscOutput = (error.stdout || '') + (error.stderr || '');

    // تقسيم المخرجات إلى سطور (كل خطأ في tsc يبدأ بمسار الملف)
    const errorLines = tscOutput
      .split('\n')
      .filter((line) => line.includes('error TS'));

    for (const line of errorLines) {
      // Regex لاستخراج مسار الملف ورسالة الخطأ
      // Format: app/index.tsx(15,2): error TS2304: Cannot find name 'View'.
      const match = line.match(/^(.+?)\(\d+,\d+\):\s+(error\s+TS\d+:\s+.+)$/);

      if (match) {
        const rawFilePath = match[1];
        const errorMessage = match[2];

        // تنظيف المسار ليكون مقروءاً في التقرير
        const cleanPath = normalizePath(rawFilePath);

        // تجنب تكرار نفس رسالة الخطأ لنفس الملف (Deduplication)
        const isAlreadyReported = unresolvedErrors.some(
          (err) => err.filePath === cleanPath && err.reason === errorMessage
        );

        if (!isAlreadyReported) {
          newErrorsFound.push({
            filePath: cleanPath,
            reason: errorMessage,
            codeSnippet:
              '// Review file manually. TypeScript compiler flagged this exact line.',
            suggestedAction:
              'Resolve TypeScript strictness errors or missing Native equivalent props.',
          });
        }
      }
    }
  }

  if (newErrorsFound.length > 0) {
    printWarning(
      `Global Audit intercepted ${newErrorsFound.length} true TypeScript errors. Added to report.`
    );
  }

  // تحديث الـ state (الـ Reducer سيقوم بعملية الإلحاق تلقائياً)
  return { unresolvedErrors: newErrorsFound };
}
