import React from 'react';
import type { SourceInfo } from '../services/aggregator';

interface SourceBadgeProps {
  source: SourceInfo | null;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Displays source attribution for data from external sources
 * Example: "via MusicBrainz", "via Last.fm"
 */
export const SourceBadge: React.FC<SourceBadgeProps> = ({
  source,
  size = 'sm',
  className = '',
}) => {
  if (!source) return null;

  const sizeClasses = {
    sm: 'text-[10px]',
    md: 'text-xs',
  };

  return (
    <span
      className={`text-white/30 uppercase tracking-wider ${sizeClasses[size]} ${className}`}
    >
      via {source.name}
    </span>
  );
};

/**
 * Inline source badge for use within text
 */
export const InlineSourceBadge: React.FC<SourceBadgeProps> = ({
  source,
  className = '',
}) => {
  if (!source) return null;

  return (
    <span className={`text-white/20 text-[10px] ml-2 ${className}`}>
      (via {source.name})
    </span>
  );
};

/**
 * Source badge with border styling
 */
export const BorderedSourceBadge: React.FC<SourceBadgeProps> = ({
  source,
  size = 'sm',
  className = '',
}) => {
  if (!source) return null;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`text-white/30 uppercase tracking-wider border border-white/10 rounded ${sizeClasses[size]} ${className}`}
    >
      via {source.name}
    </span>
  );
};

export default SourceBadge;
