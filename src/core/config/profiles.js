/**
 * إعدادات وبروفايلات المسح للمشاريع المختلفة
 */

/**
 * الامتدادات المسموح بها للملفات
 * تشمل الامتدادات الحديثة مثل .mjs و .mts
 */
export const ALLOWED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.cjs', '.mts', '.cts',
  '.json'
];

/**
 * بروفايلات المشاريع وقواعد المسح الخاصة بكل منها
 */
export const PROJECT_PROFILES = {
  vite: {
    key: 'vite',
    // Pass 1: Root Files (Exact check, no scanning)
    // ملفات يجب فحصها في الجذر مباشرة
    rootFiles: [
      'index.html',
      'vite.config.js',
      'vite.config.ts',
      'package.json',
      'tsconfig.json',
      '.env',
      '.env.local'
    ],
    // Pass 2: Deep Scan Directories
    // مجلدات يتم فحصها بشكل تكراري (Recursive)
    recursiveDirs: ['src'],
    // Global Ignores
    // مجلدات يتم تجاهلها تماماً
    ignoreDirs: [
      'node_modules',
      'dist',
      '.vite',
      'public',
      'coverage',
      '.git',
      '.vscode',
      '.idea',
      '.storybook',
      'storybook-static'
    ],
    // [New] Write Phase Ignores (Regex)
    // ملفات يتم منع كتابتها في مشروع الموبايل
    writePhaseIgnores: [
      /^index\.html$/,
      /^vite\.config\.(js|ts|mjs|cjs)$/,
      /^\.env\.local$/,
      /.*package\.json$/  // 👈 هذا يمنع أي package.json يتم اكتشافه داخل مجلدات مثل src/
    ]
  },

  cra: {
    key: 'cra',
    // CRA usually has index.html in public/, but logic might be different.
    // We stick to the Master Plan's suggested root files.
    rootFiles: [
      'package.json',
      'README.md',
      'tsconfig.json',
      'jsconfig.json',
      '.env',
      '.env.local'
    ],
    // CRA is strict about src
    recursiveDirs: ['src'],
    ignoreDirs: [
      'node_modules',
      'build',
      'public', // CRA Code is in src, public is static assets usually
      'coverage',
      '.git',
      '.vscode',
      '.idea'
    ],
    // [New] Write Phase Ignores (Regex)
    writePhaseIgnores: [
      /^public\/index\.html$/,
      /^craco\.config\.(js|ts)$/,
      /^react-app-env\.d\.ts$/,
      /.*package\.json$/  // 👈 هذا يمنع أي package.json يتم اكتشافه داخل مجلدات مثل src/
    ]
  }
};
