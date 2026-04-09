import fs from 'fs-extra';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { BABEL_REGISTRY } from '../config/babelRegistry.js';

export async function autoConfigureBabel(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const babelConfigPath = path.join(projectPath, 'babel.config.js');

  // 1. read installed libraries
  if (!fs.existsSync(packageJsonPath)) return;
  const pkg = await fs.readJson(packageJsonPath);
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

  let pluginsToAdd = [];
  let reanimatedPlugin = null;
  const hasNativeWind = !!dependencies['nativewind'];

  // 2. extract plugins from registry (without nativewind and expo-router)
  Object.keys(dependencies).forEach((depName) => {
    if (BABEL_REGISTRY[depName]) {
      const config = BABEL_REGISTRY[depName];
      if (config.isLast) {
        reanimatedPlugin = config.plugin;
      } else if (config.plugin) {
        pluginsToAdd.push(config.plugin);
      }
    }
  });

  // 3. prepare AST
  const project = new Project({ useInMemoryFileSystem: false });
  let babelContent = `module.exports = function (api) {\n  api.cache(true);\n  return {\n    presets: ["babel-preset-expo"],\n    plugins: [],\n  };\n};`;

  if (fs.existsSync(babelConfigPath)) {
    babelContent = fs.readFileSync(babelConfigPath, 'utf8');
  }

  const sourceFile = project.createSourceFile(babelConfigPath, babelContent, {
    overwrite: true,
  });

  const moduleExports = sourceFile
    .getStatements()
    .find(
      (stmt) =>
        stmt.getKind() === SyntaxKind.ExpressionStatement &&
        stmt.getText().startsWith('module.exports')
    );

  if (moduleExports) {
    const returnStatement = moduleExports.getDescendantsOfKind(
      SyntaxKind.ReturnStatement
    )[0];

    if (returnStatement) {
      const objectLiteral = returnStatement.getFirstChildByKind(
        SyntaxKind.ObjectLiteralExpression
      );

      if (objectLiteral) {
        let presetsProp = objectLiteral.getProperty('presets');
        if (presetsProp) presetsProp.remove(); // Remove old presets

        //  NativeWind
        const presetsConfig = hasNativeWind
          ? `[\n      ["babel-preset-expo", { jsxImportSource: "nativewind" }],\n      "nativewind/babel",\n    ]`
          : `["babel-preset-expo"]`;

        // Inject the new formatted property
        objectLiteral.insertPropertyAssignment(0, {
          name: 'presets',
          initializer: presetsConfig,
        });

        // ─── Remove old plugins ──────────────────────────────────────────
        let pluginsProp = objectLiteral.getProperty('plugins');
        if (pluginsProp) pluginsProp.remove(); // Remove old plugins

        // Add plugins only if there are actual plugins
        if (pluginsToAdd.length > 0 || reanimatedPlugin) {
          const uniquePlugins = [...new Set(pluginsToAdd)];

          let pluginsStringArray = uniquePlugins.map((p) =>
            typeof p === 'string' ? `"${p}"` : JSON.stringify(p)
          );

          // Force Reanimated to be at the end of the list
          if (reanimatedPlugin) {
            const reanimStr =
              typeof reanimatedPlugin === 'string'
                ? `"${reanimatedPlugin}"`
                : JSON.stringify(reanimatedPlugin);

            pluginsStringArray = pluginsStringArray.filter(
              (p) => p !== reanimStr
            );
            pluginsStringArray.push(reanimStr);
          }

          const pluginsConfig = `[\n      ${pluginsStringArray.join(',\n      ')},\n    ]`;

          objectLiteral.addPropertyAssignment({
            name: 'plugins',
            initializer: pluginsConfig,
          });
        }
      }
    }
  }

  // 4. Save
  sourceFile.saveSync();
  console.log(
    '✅ Babel config updated to exact target format (NativeWind v4 ready).'
  );
}
