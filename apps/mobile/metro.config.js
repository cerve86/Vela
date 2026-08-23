const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/**
 * Monorepo wiring. Metro must watch the workspace root so edits to packages/shared
 * trigger a reload, and must resolve modules from the hoisted root node_modules —
 * npm workspaces hoist almost everything up there.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

/**
 * Hierarchical lookup stays ON.
 *
 * Disabling it is the old Expo monorepo recipe, and it broke the moment anything imported
 * Reanimated: `react-native-reanimated/scripts/validate-worklets-version.js` requires
 * `semver`, npm could not hoist that one (several packages here pin different majors) so
 * it sits at `react-native-reanimated/node_modules/semver`, and with the walk-up switched
 * off Metro cannot see a nested dependency at all — it consults only the two paths above.
 * The failure is a bundle-time "Unable to resolve module semver/functions/satisfies",
 * which on the surface looks nothing like a resolver setting.
 *
 * `nodeModulesPaths` still lists the hoisted root first, so the duplicate-React problem
 * the flag was guarding against stays guarded by precedence rather than by prohibition.
 */

module.exports = config;
