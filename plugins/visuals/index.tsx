import { PluginDefinition } from '../../types';
import { VisualsView } from './VisualsView';

const visualsPlugin: PluginDefinition = {
  id: 'visuals',
  label: 'Visuals',
  icon: 'sliders',
  view: VisualsView,
};

export default visualsPlugin;
