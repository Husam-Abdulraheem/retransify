import fs from 'fs-extra';
import path from 'path';
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
  let reanimatedPlugin = null; // Keep it to be added at the end

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

  // 3. Read or create babel.config.js
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

  // 4. Inject plugins into string
  // Note: AST is preferred, but string manipulation is faster here

  const newPluginsString = generatePluginsArrayString(
    pluginsToAdd,
    reanimatedPlugin
  );

  const regex = /plugins:\s*\[([\s\S]*?)\]/;

  if (regex.test(babelContent)) {
    babelContent = babelContent.replace(regex, () => {
      return `plugins: ${newPluginsString}`;
    });
  } else {
    babelContent = babelContent.replace(
      /presets:\s*\['babel-preset-expo'\],/,
      `presets: ['babel-preset-expo'],\n    plugins: ${newPluginsString},`
    );
  }

  // 5. Save the file
  fs.writeFileSync(babelConfigPath, babelContent);
  console.log(
    '✅ Babel config updated automatically based on installed packages.'
  );
}

function generatePluginsArrayString(normalPlugins, lastPlugin) {
  const allPlugins = [...normalPlugins];
  if (lastPlugin) allPlugins.push(lastPlugin); // Ensure reanimated is at the end

  const formatted = allPlugins.map((p) => {
    if (typeof p === 'string') return `'${p}'`;
    return JSON.stringify(p);
  });

  return `[\n      ${formatted.join(',\n      ')}\n    ]`;
}
