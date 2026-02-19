import React from 'react';
import { PluginDefinition } from '../../types';
import { DownloaderView } from './DownloaderView';

const BoatIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <img src="/64x64/boat.png" alt="Downloader" width={size} height={size} className={className} style={{ objectFit: 'contain' }} />
);

const downloaderPlugin: PluginDefinition = {
  id: 'downloader',
  label: 'Downloader',
  icon: BoatIcon,
  view: DownloaderView,
};

export default downloaderPlugin;
