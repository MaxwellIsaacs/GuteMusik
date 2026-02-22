import { PluginDefinition } from '../types';
import downloader from './downloader';

// Alpha release: downloader only
const allBuiltinPlugins: PluginDefinition[] = [
  downloader,
];

// Set VITE_ENABLE_PLUGINS=true to include built-in plugins in build
// User-imported plugins are always available regardless of this flag
export const builtinPlugins: PluginDefinition[] =
  import.meta.env.VITE_ENABLE_PLUGINS === 'true' ? allBuiltinPlugins : [];

export default builtinPlugins;
