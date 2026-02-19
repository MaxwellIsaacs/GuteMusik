import { PluginDefinition } from '../types';
import stats from './stats';
import downloader from './downloader';
import visuals from './visuals';
import terminal from './terminal';

// Built-in plugins (bundled with app)
const allBuiltinPlugins: PluginDefinition[] = [
  stats,
  downloader,
  visuals,
  terminal,
];

// Set VITE_ENABLE_PLUGINS=true to include built-in plugins in build
// User-imported plugins are always available regardless of this flag
export const builtinPlugins: PluginDefinition[] =
  import.meta.env.VITE_ENABLE_PLUGINS === 'true' ? allBuiltinPlugins : [];

export default builtinPlugins;
