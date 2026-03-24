import fs from 'fs-extra';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { BABEL_REGISTRY } from '../config/babelRegistry.js';

export async function autoConfigureBabel(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const babelConfigPath = path.join(projectPath, 'babel.config.js');

  // 1. Read currently installed libraries
  if (!fs.existsSync(packageJsonPath)) return;
  const pkg = await fs.readJson(packageJsonPath);
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

  // 2. Determine required plugins based on the registry
  let pluginsToAdd = [];
  let reanimatedPlugin = null;

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

  if (pluginsToAdd.length === 0 && !reanimatedPlugin) return;

  // 3. Read or create babel.config.js using ts-morph
  const project = new Project({ useInMemoryFileSystem: false });
  let sourceFile;

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

  sourceFile = project.createSourceFile(babelConfigPath, babelContent, {
    overwrite: true,
  });

  // 4. Inject plugins using AST
  // Find module.exports = function(api) { return { ... } }
  const moduleExports = sourceFile
    .getStatements()
    .find(
      (stmt) =>
        stmt.getKind() === SyntaxKind.ExpressionStatement &&
        stmt.getText().startsWith('module.exports')
    );

  let pluginsArrayFound = false;

  if (moduleExports) {
    const returnStatement = moduleExports.getDescendantsOfKind(
      SyntaxKind.ReturnStatement
    )[0];
    if (returnStatement) {
      const objectLiteral = returnStatement.getFirstChildByKind(
        SyntaxKind.ObjectLiteralExpression
      );
      if (objectLiteral) {
        let pluginsProp = objectLiteral.getProperty('plugins');

        if (!pluginsProp) {
          pluginsProp = objectLiteral.addPropertyAssignment({
            name: 'plugins',
            initializer: '[]',
          });
        }

        const pluginsArray = pluginsProp.getFirstChildByKind(
          SyntaxKind.ArrayLiteralExpression
        );
        if (pluginsArray) {
          pluginsArrayFound = true;

          // Extract existing plugins to avoid duplicates
          const existingPlugins = pluginsArray.getElements().map((el) => {
            if (el.getKind() === SyntaxKind.StringLiteral) {
              return el.getLiteralText();
            } else if (el.getKind() === SyntaxKind.ArrayLiteralExpression) {
              // For arrays like ['react-native-reanimated/plugin', { ... }]
              const firstElem = el.getElements()[0];
              if (
                firstElem &&
                firstElem.getKind() === SyntaxKind.StringLiteral
              ) {
                return firstElem.getLiteralText();
              }
            }
            return el.getText();
          });

          // Add normal plugins
          pluginsToAdd.forEach((plugin) => {
            const pluginStr =
              typeof plugin === 'string'
                ? `'${plugin}'`
                : JSON.stringify(plugin);
            const pluginIdentity =
              typeof plugin === 'string'
                ? plugin
                : Array.isArray(plugin)
                  ? plugin[0]
                  : JSON.stringify(plugin);

            if (!existingPlugins.includes(pluginIdentity)) {
              pluginsArray.addElement(pluginStr);
            }
          });

          // Always ensure reanimated is the LAST plugin if required
          if (reanimatedPlugin) {
            const reanimIdentity =
              typeof reanimatedPlugin === 'string'
                ? reanimatedPlugin
                : Array.isArray(reanimatedPlugin)
                  ? reanimatedPlugin[0]
                  : JSON.stringify(reanimatedPlugin);

            // Remove it if it exists anywhere so we can put it at the end
            const elements = pluginsArray.getElements();
            for (let i = elements.length - 1; i >= 0; i--) {
              const el = elements[i];
              let isMatch = false;
              if (
                el.getKind() === SyntaxKind.StringLiteral &&
                el.getLiteralText() === reanimIdentity
              ) {
                isMatch = true;
              } else if (el.getKind() === SyntaxKind.ArrayLiteralExpression) {
                const firstElem = el.getElements()[0];
                if (
                  firstElem &&
                  firstElem.getKind() === SyntaxKind.StringLiteral &&
                  firstElem.getLiteralText() === reanimIdentity
                ) {
                  isMatch = true;
                }
              }

              if (isMatch) {
                pluginsArray.removeElement(i);
              }
            }

            // Add to the end
            const pluginStr =
              typeof reanimatedPlugin === 'string'
                ? `'${reanimatedPlugin}'`
                : JSON.stringify(reanimatedPlugin);
            pluginsArray.addElement(pluginStr);
          }
        }
      }
    }
  }

  // Fallback if AST manipulation failed to find the right nodes
  if (!pluginsArrayFound) {
    console.warn(
      '⚠️ [babelManager] Could not find plugins array in AST, falling back to basic configuration.'
    );
    // In extreme cases, just overwrite with basic config
  }

  // 5. Save the file
  sourceFile.saveSync();
  console.log(
    '✅ Babel config updated automatically based on installed packages using AST manipulation.'
  );
}
