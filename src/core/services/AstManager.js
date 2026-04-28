import { Project } from 'ts-morph';

let webProjectInstance = null;
let expoProjectInstance = null;

/**
 * AstManager handles shared ts-morph projects to optimize memory and CPU.
 * It prevents redundant parsing of the same files across different graph nodes.
 */
export class AstManager {
  /**
   * 1. Web Project - Optimized for reading/scanning original source.
   * Used by: analyzerNode, RouteAnalyzer, plannerNode
   */
  static getWebProject() {
    if (!webProjectInstance) {
      webProjectInstance = new Project({
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true, // Extreme speed, no deep tracking
        compilerOptions: {
          allowJs: true,
          noEmit: true,
          jsx: 2, // React JSX
          strict: false,
          skipLibCheck: true,
          noResolve: true,
          isolatedModules: true,
          resolveJsonModule: true,
          moduleResolution: 2,
          target: 99,
        },
      });
    }
    return webProjectInstance;
  }

  /**
   * 2. Expo Project - Optimized for strict verification and writing.
   * Used by: verifierNode, contextUpdaterNode
   */
  static getExpoProject(targetProjectPath) {
    if (!expoProjectInstance) {
      expoProjectInstance = new Project({
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: false, // Important for detecting broken imports
        compilerOptions: {
          allowJs: true,
          noEmit: true,
          jsx: 4,
          esModuleInterop: true,
          strict: false,
          skipLibCheck: true,
          resolveJsonModule: true,
          moduleResolution: 2,
          target: 99,
          baseUrl: targetProjectPath || '.',
          paths: {
            '@/*': ['./*'], // Supports Expo absolute aliases
          },
        },
      });
    }
    return expoProjectInstance;
  }

  /**
   * 3. Strict Verification Project - Ephemeral, per-file, strict-mode project.
   *
   * NOT a singleton. Each call returns a fresh Project instance.
   * This is intentional: the strict verifier must start with a clean slate
   * containing only the files relevant to the current verification pass
   * (the generated file + its registered contract dependencies). Sharing a
   * single instance would cause cross-contamination between files and produce
   * stale diagnostics from previously-upserted files.
   *
   * Strict flags enabled:
   *   - strictNullChecks      — catches `undefined` passed where a type is expected
   *   - strictFunctionTypes   — catches argument shape mismatches in function types
   *   - noImplicitAny         — forces explicit types so missing params are visible
   *
   * skipLibCheck remains true: React Native / Expo type definitions have their
   * own strict inconsistencies; we don't want those to pollute cross-file checks.
   *
   * @param {string} [baseUrl] - Project base URL for @/ alias resolution
   * @returns {import('ts-morph').Project} A fresh strict ts-morph Project
   */
  static getStrictVerificationProject(baseUrl) {
    return new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: false,
      compilerOptions: {
        allowJs: true,
        noEmit: true,
        jsx: 4,
        esModuleInterop: true,
        strict: false,
        strictNullChecks: true,
        strictFunctionTypes: true,
        noImplicitAny: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        moduleResolution: 2,
        target: 99,
        baseUrl: baseUrl || '.',
        paths: {
          '@/*': ['./*'],
        },
      },
    });
  }

  /**
   * Fast Upsert - Updates or adds a file in the memory project.
   * Prevents memory leaks by reusing SourceFile objects.
   */
  static upsertExpoFile(absolutePath, content, targetProjectPath) {
    const project = this.getExpoProject(targetProjectPath);
    let sourceFile = project.getSourceFile(absolutePath);

    if (sourceFile) {
      // Direct replacement is much faster than deleting/recreating
      if (sourceFile.getFullText() !== content) {
        sourceFile.replaceWithText(content);
      }
    } else {
      sourceFile = project.createSourceFile(absolutePath, content, {
        overwrite: true,
      });
    }

    return sourceFile;
  }

  /**
   * Clear all projects - Should be called at the end of the run (if needed).
   */
  static clear() {
    webProjectInstance = null;
    expoProjectInstance = null;
  }
}
