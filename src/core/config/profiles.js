/**
 * Scanning configuration and profiles for different projects
 */

/**
 * Allowed file extensions
 * Includes modern extensions like .mjs and .mts
 */
export const ALLOWED_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
];

/**
 * Project profiles and their specific scanning rules
 */
export const PROJECT_PROFILES = {
  vite: {
    key: 'vite',
    // Pass 1: Root Files (Exact check, no scanning)
    // Files that must be scanned directly in the root
    rootFiles: [
      'index.html',
      'vite.config.js',
      'vite.config.ts',
      'package.json',
      'tsconfig.json',
      '.env',
      '.env.local',
    ],
    // Pass 2: Deep Scan Directories
    // Directories to be scanned recursively
    recursiveDirs: ['src'],
    // Global Ignores
    // Directories to be completely ignored
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
      'storybook-static',
    ],
    // [New] Write Phase Ignores (Regex)
    // Files that are prevented from being written in the mobile project
    writePhaseIgnores: [
      /^index\.html$/,
      /^vite\.config\.(js|ts|mjs|cjs)$/,
      /^\.env\.local$/,
      /.*package\.json$/, // 👈 Prevents any package.json discovered inside folders like src/
    ],
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
      '.env.local',
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
      '.idea',
    ],
    // [New] Write Phase Ignores (Regex)
    writePhaseIgnores: [
      /^public\/index\.html$/,
      /^craco\.config\.(js|ts)$/,
      /^react-app-env\.d\.ts$/,
      /.*package\.json$/, // 👈 Prevents any package.json discovered inside folders like src/
    ],
  },
};
