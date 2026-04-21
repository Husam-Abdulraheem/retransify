import fs from 'fs-extra';
import path from 'path';

/**
 * AppConfigService - Handles dynamic updates to Expo configuration
 */
export class AppConfigService {
  /**
   * Updates specific fields in app.json based on the source web project
   * @param {string} webProjectPath - Path to the original React web project
   * @param {string} expoProjectPath - Path to the generated Expo project
   */
  static async updateMetadata(webProjectPath, expoProjectPath) {
    const webPackageJsonPath = path.join(webProjectPath, 'package.json');
    const appJsonPath = path.join(expoProjectPath, 'app.json');

    // 1. Extract and sanitize information from web package.json
    let rawName = 'retransify-app';
    if (await fs.pathExists(webPackageJsonPath)) {
      const webPackage = await fs.readJson(webPackageJsonPath);
      rawName = webPackage.name || rawName;
    }

    // Sanitize for Slug: lowercase, alphanumeric and hyphens only
    const cleanSlug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '');

    // Sanitize for Scheme: alphanumeric only, no hyphens or special characters
    const cleanScheme = cleanSlug.replace(/-/g, '');

    const finalName = `${rawName} (Retransify)`;

    // 2. Perform "Surgical Update" on app.json
    if (await fs.pathExists(appJsonPath)) {
      const appConfig = await fs.readJson(appJsonPath);

      // Ensure the nested structure exists before assignment
      if (!appConfig.expo) appConfig.expo = {};

      // Modify only the requested fields
      appConfig.expo.name = finalName;
      appConfig.expo.slug = cleanSlug;
      appConfig.expo.scheme = cleanScheme;

      // Write back the modified object, preserving other template settings
      await fs.writeJson(appJsonPath, appConfig, { spaces: 2 });

      return { name: finalName, slug: cleanSlug, scheme: cleanScheme };
    } else {
      throw new Error(
        `Critical Error: app.json not found in template at ${appJsonPath}`
      );
    }
  }
}
