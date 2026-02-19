import { PluginDefinition } from '../../types';
import { StatsView } from './StatsView';

const statsPlugin: PluginDefinition = {
  id: 'stats',
  label: 'Stats',
  icon: 'equalizer',
  view: StatsView,
};

export default statsPlugin;
