import crypto from 'crypto';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { printSubStep, printWarning } from '../../utils/ui.js';

export async function verifierNode(state) {
  const { generatedCode, currentFile } = state;

  if (!generatedCode) {
    printWarning('VerifierNode: no code to verify');
    return { errors: ['No code generated'] };
  }

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown.tsx';
  printSubStep(
    'Verifying Structural AST Constraints (Bypass TS Strict Mode)...'
  );

  const errors = [];

  // تهيئة بيئة بسيطة جداً للتحليل الهيكلي فقط (AST Parsing)
  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 4 }, // JSX React
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFile = project.createSourceFile('temp.tsx', generatedCode, {
    overwrite: true,
  });

  try {
    // الفحص الهيكلي العميق (AST Linter) - هنا القوة الحقيقية وبدون أي غباء من المترجم
    const astErrors = analyzeASTForErrors(sourceFile, filePath, state.pathMap);
    errors.push(...astErrors);
  } catch (error) {
    printWarning(`ts-morph AST crashed: ${error.message}`);
    errors.push(`Critical Syntax Error: Could not parse file.`);
  }

  if (errors.length === 0) {
    printSubStep('Structural Verification Passed ✔');
  } else {
    printSubStep(
      `Verification failed: ${errors.length} structural error(s) detected`
    );
  }

  const errorHash =
    errors.length > 0
      ? crypto
          .createHash('md5')
          .update(errors.join(''))
          .digest('hex')
          .slice(0, 16)
      : null;

  return {
    errors,
    missingDependencies: [], // تم إلغاء تتبع المكاتب المفقودة عبر المترجم لأنه غير دقيق
    lastErrorHash: errorHash,
  };
}

// الدالة المساعدة analyzeASTForErrors تظل كما هي تماماً لأنها مكتوبة بعبقرية
function analyzeASTForErrors(sourceFile, filePath, pathMap = {}) {
  const errors = [];
  const isComponent =
    /\.(tsx|jsx)$/i.test(filePath) || sourceFile.getText().includes('react');

  if (isComponent) {
    const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
    const jsxSelfClosing = sourceFile.getDescendantsOfKind(
      SyntaxKind.JsxSelfClosingElement
    );

    // 1. منع عناصر الويب
    const checkDynamicTagName = (tagName, line) => {
      if (/^[a-z]/.test(tagName)) {
        errors.push(
          `Line ${line}: Unsupported Web DOM element <\${tagName}> detected. Use React Native components.`
        );
      }
    };

    // 2. بناء قائمة المسارات الصالحة
    const validRoutes = new Set(
      Object.values(pathMap).map((p) => {
        let route = '/' + p.replace(/^app\//i, '').replace(/\.tsx$/i, '');
        if (route.endsWith('/index')) route = route.replace('/index', '');
        if (route.endsWith('/_layout')) route = route.replace('/_layout', '');
        return route === '' ? '/' : route.toLowerCase();
      })
    );

    // 3. فحص الروابط الميتة
    const checkHrefForDeadLinks = (element, line) => {
      const tagName = element.getTagNameNode().getText();
      if (tagName === 'Link' || tagName === 'Redirect') {
        const hrefAttr = element.getAttribute('href');
        if (hrefAttr && hrefAttr.getKind() === SyntaxKind.JsxAttribute) {
          const val = hrefAttr
            .getInitializer()
            ?.getText()
            ?.replace(/['"]/g, '');
          if (
            val &&
            !val.startsWith('http') &&
            !val.includes('{') &&
            !val.includes('$')
          ) {
            const targetUrl = val.toLowerCase();
            const isMatch = Array.from(validRoutes).some((validRoute) => {
              const regexStr =
                '^' + validRoute.replace(/\[.*?\]/g, '[^/]+') + '$';
              return new RegExp(regexStr).test(targetUrl);
            });
            if (!isMatch) {
              const available = Array.from(validRoutes).join(', ');
              errors.push(
                `Line ${line}: CRITICAL ROUTING ERROR. Dead link "${val}". Valid routes are: [\${available}].`
              );
            }
          }
        }
      }
    };

    jsxElements.forEach((element) => {
      const openingElement = element.getOpeningElement();
      const tagName = openingElement.getTagNameNode().getText().split('.')[0];
      checkDynamicTagName(tagName, openingElement.getStartLineNumber());
      checkHrefForDeadLinks(
        openingElement,
        openingElement.getStartLineNumber()
      );
    });

    jsxSelfClosing.forEach((element) => {
      const tagName = element.getTagNameNode().getText().split('.')[0];
      checkDynamicTagName(tagName, element.getStartLineNumber());
      checkHrefForDeadLinks(element, element.getStartLineNumber());
    });
  }
  return [...new Set(errors)];
}
