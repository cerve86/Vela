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
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
