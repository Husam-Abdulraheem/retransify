import fs from 'fs-extra';
import path from 'path';
import { BABEL_REGISTRY } from '../config/babelRegistry.js';

export async function autoConfigureBabel(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const babelConfigPath = path.join(projectPath, 'babel.config.js');

  // 1. قراءة المكتبات المثبتة حالياً
  if (!fs.existsSync(packageJsonPath)) return;
  const pkg = await fs.readJson(packageJsonPath);
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

  // 2. تحديد البلاجنز المطلوبة بناءً على القاموس
  let pluginsToAdd = [];
  let reanimatedPlugin = null; // نحتفظ به لنضعه في النهاية

  Object.keys(dependencies).forEach((depName) => {
    if (BABEL_REGISTRY[depName]) {
      const config = BABEL_REGISTRY[depName];
      
      if (config.isLast) {
        reanimatedPlugin = config.plugin;
      } else {
        pluginsToAdd.push(config.plugin);
      }
    }
  });

  // إذا لم يكن هناك ما يلزم إضافته، توقف
  if (pluginsToAdd.length === 0 && !reanimatedPlugin) return;

  // 3. قراءة ملف babel.config.js (أو إنشاؤه إذا لم يوجد)
  let babelContent = `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [],
  };
};`;

  if (fs.existsSync(babelConfigPath)) {
    babelContent = fs.readFileSync(babelConfigPath, 'utf8');
  }

  // 4. "حقن" البلاجنز داخل النص (String Injection)
  // ملاحظة: التعامل مع AST هو الأفضل ولكن المعالجة النصية هنا أسرع للأدوات البسيطة
  
  const newPluginsString = generatePluginsArrayString(pluginsToAdd, reanimatedPlugin);
  
  // نبحث عن مصفوفة plugins ونقوم باستبدالها أو تحديثها
  // هذا تعبير منتظم (Regex) بسيط لاستبدال المصفوفة الفارغة أو الموجودة
  const regex = /plugins:\s*\[([\s\S]*?)\]/;
  
  if (regex.test(babelContent)) {
    babelContent = babelContent.replace(regex, (match, existingContent) => {
      // دمج المحتوى الموجود مع الجديد (تجنب التكرار يدوياً إن شئت)
      // هنا سنقوم بإعادة بناء القائمة لضمان الترتيب
      return `plugins: ${newPluginsString}`; 
    });
  } else {
    // إذا لم يجد plugins، يضيفها بعد presets
    babelContent = babelContent.replace(
      /presets:\s*\['babel-preset-expo'\],/,
      `presets: ['babel-preset-expo'],\n    plugins: ${newPluginsString},`
    );
  }

  // 5. حفظ الملف
  fs.writeFileSync(babelConfigPath, babelContent);
  console.log('✅ Babel config updated automatically based on installed packages.');
}

// دالة مساعدة لتحويل المصفوفة إلى نص منسق
function generatePluginsArrayString(normalPlugins, lastPlugin) {
  const allPlugins = [...normalPlugins];
  if (lastPlugin) allPlugins.push(lastPlugin); // التأكد أن reanimated في الأخير

  // تحويل الكائنات (Objects) إلى JSON string والنصوص تبقى نصوصاً
  const formatted = allPlugins.map(p => {
    if (typeof p === 'string') return `'${p}'`;
    return JSON.stringify(p);
  });

  return `[\n      ${formatted.join(',\n      ')}\n    ]`;
}
