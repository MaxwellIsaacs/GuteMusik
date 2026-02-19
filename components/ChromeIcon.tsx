import React from 'react';

/**
 * Chrome-style metallic icon component.
 * Renders PNG icons from the sized icon directories (32x32, 64x64, etc.)
 * Size directories: 32x32, 64x64, 128x128, 256x256, 512x512
 */

// Map of available chrome icon names
export type ChromeIconName =
  | 'accessibility' | 'album' | 'download' | 'equalizer' | 'fast-forward' | 'fullscreen'
  | 'hashtag' | 'headphones' | 'heart' | 'menu' | 'microphone'
  | 'minimize' | 'music-folder' | 'music-note' | 'pause' | 'pip' | 'pip-window' | 'playlist'
  | 'play' | 'power' | 'repeat-one' | 'repeat' | 'rewind'
  | 'search' | 'settings' | 'share' | 'shuffle' | 'skip-backward'
  | 'skip-forward' | 'sliders' | 'star' | 'stop' | 'volume-high'
  | 'volume-minus' | 'volume-mute' | 'volume-off' | 'volume-on' | 'volume-plus';

// Pick the smallest directory whose resolution is >= 2x the rendered size
function pickDir(size: number): string {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const needed = size * dpr;
  if (needed <= 32) return '32x32';
  if (needed <= 64) return '64x64';
  if (needed <= 128) return '128x128';
  if (needed <= 256) return '256x256';
  return '512x512';
}

interface ChromeIconProps {
  name: ChromeIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ChromeIcon: React.FC<ChromeIconProps> = ({ name, size = 16, className = '', style }) => {
  const dir = pickDir(size);
  return (
    <img
      src={`/${dir}/${name}.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={`inline-block flex-shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  );
};
