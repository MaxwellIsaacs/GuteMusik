import React, { useState, useMemo, useCallback } from 'react';
import { PluginViewProps } from '../../types';
import { useServer } from '../../context/ServerContext';
import { useAudio } from '../../context/AudioContext';

// ─── Helpers ──────────────────────────────────────────────────
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

const PALETTE = [
  '#a78bfa', // violet-400
  '#818cf8', // indigo-400
  '#6366f1', // indigo-500
  '#c084fc', // purple-400
  '#e879f9', // fuchsia-400
  '#f472b6', // pink-400
  '#fb923c', // orange-400
  '#34d399', // emerald-400
  '#22d3ee', // cyan-400
  '#facc15', // yellow-400
];

const FORMAT_COLORS: Record<string, string> = {
  FLAC: '#a78bfa',
  '320kbps': '#818cf8',
  '192kbps': '#6366f1',
  OPUS: '#c084fc',
  MP3: '#f472b6',
  AAC: '#22d3ee',
  OGG: '#34d399',
  WAV: '#facc15',
};

const SIZE_LABELS: Record<string, string> = {
  xl: 'XL (20+ tracks)',
  large: 'Large (14-19)',
  medium: 'Standard (8-13)',
  small: 'EP / Single (<8)',
};

// ─── Donut Chart ──────────────────────────────────────────────
interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const DonutChart: React.FC<{
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  activeIndex: number | null;
  onHover: (i: number | null) => void;
}> = ({ segments, size = 200, thickness = 28, activeIndex, onHover }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;

  let cumulative = 0;
  const arcs = segments.map((seg, i) => {
    const startAngle = (cumulative / total) * 360;
    const sweep = (seg.value / total) * 360;
    cumulative += seg.value;
    const endAngle = startAngle + sweep;
    const isActive = activeIndex === i;
    const arcR = isActive ? r + 4 : r;
    const arcThickness = isActive ? thickness + 6 : thickness;
    return (
      <path
        key={i}
        d={describeArc(cx, cy, arcR, startAngle, Math.max(endAngle - 0.5, startAngle + 0.1))}
        fill="none"
        stroke={seg.color}
        strokeWidth={arcThickness}
        strokeLinecap="round"
        opacity={activeIndex === null || isActive ? 1 : 0.3}
        style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
        onMouseEnter={() => onHover(i)}
        onMouseLeave={() => onHover(null)}
        className="cursor-pointer"
      />
    );
  });

  const centerLabel = activeIndex !== null ? segments[activeIndex] : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      {centerLabel ? (
        <>
          <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize="22" fontWeight="700">
            {centerLabel.value}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="500">
            {centerLabel.label}
          </text>
        </>
      ) : (
        <>
          <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize="26" fontWeight="700">
            {total}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontWeight="500">
            TOTAL
          </text>
        </>
      )}
    </svg>
  );
};

// ─── Horizontal Bar ───────────────────────────────────────────
const HBar: React.FC<{
  items: { label: string; value: number; color: string; sub?: string }[];
  maxValue?: number;
  onClickItem?: (label: string) => void;
}> = ({ items, maxValue: forcedMax, onClickItem }) => {
  const max = forcedMax ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = Math.max((item.value / max) * 100, 2);
        return (
          <div
            key={i}
            className={`group ${onClickItem ? 'cursor-pointer' : ''}`}
            onClick={() => onClickItem?.(item.label)}
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors truncate mr-2">
                {item.label}
              </span>
              <span className="text-xs text-white/40 tabular-nums flex-shrink-0">
                {item.value.toLocaleString()}{item.sub ? ` ${item.sub}` : ''}
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Radial Clock (stats.fm listening-clock inspired) ─────────
const RadialClock: React.FC<{
  data: number[]; // 24 values, one per hour
  size?: number;
}> = ({ data, size = 240 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const maxVal = Math.max(...data, 1);
  const innerR = size * 0.18;
  const outerR = size * 0.44;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Hour labels */}
      {[0, 6, 12, 18].map((h) => {
        const angle = (h / 24) * 360;
        const labelR = outerR + 16;
        const pos = polarToCartesian(cx, cy, labelR, angle);
        const labels: Record<number, string> = { 0: '12a', 6: '6a', 12: '12p', 18: '6p' };
        return (
          <text key={h} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="500">
            {labels[h]}
          </text>
        );
      })}

      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

      {/* Bars */}
      {data.map((val, h) => {
        const angleDeg = (h / 24) * 360;
        const barLength = innerR + ((val / maxVal) * (outerR - innerR));
        const startP = polarToCartesian(cx, cy, innerR + 2, angleDeg);
        const endP = polarToCartesian(cx, cy, barLength, angleDeg);
        const intensity = val / maxVal;
        return (
          <line
            key={h}
            x1={startP.x} y1={startP.y} x2={endP.x} y2={endP.y}
            stroke={`rgba(167, 139, 250, ${0.2 + intensity * 0.8})`}
            strokeWidth={Math.max(size * 0.028, 4)}
            strokeLinecap="round"
          >
            <title>{`${h}:00 — ${val} albums`}</title>
          </line>
        );
      })}

      {/* Center label */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10" fontWeight="600">
        HOUR
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8">
        ACTIVITY
      </text>
    </svg>
  );
};

// ─── Mini Heatmap Grid ────────────────────────────────────────
const HeatmapGrid: React.FC<{
  data: number[][]; // 7 rows (days) x N cols
  rowLabels: string[];
  colLabels: string[];
  color?: string;
}> = ({ data, rowLabels, colLabels, color = '#a78bfa' }) => {
  const maxVal = Math.max(...data.flat(), 1);
  const cellSize = 28;
  const gap = 3;
  const labelW = 32;
  const labelH = 20;
  const width = labelW + colLabels.length * (cellSize + gap);
  const height = labelH + data.length * (cellSize + gap);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Col labels */}
      {colLabels.map((label, c) => (
        <text key={c} x={labelW + c * (cellSize + gap) + cellSize / 2} y={12} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="500">
          {label}
        </text>
      ))}
      {/* Rows */}
      {data.map((row, r) => (
        <g key={r}>
          <text x={0} y={labelH + r * (cellSize + gap) + cellSize / 2 + 3} fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="500">
            {rowLabels[r]}
          </text>
          {row.map((val, c) => {
            const intensity = val / maxVal;
            return (
              <rect
                key={c}
                x={labelW + c * (cellSize + gap)}
                y={labelH + r * (cellSize + gap)}
                width={cellSize}
                height={cellSize}
                rx={6}
                fill={color}
                opacity={0.08 + intensity * 0.85}
                className="cursor-crosshair"
              >
                <title>{`${rowLabels[r]} ${colLabels[c]}: ${val}`}</title>
              </rect>
            );
          })}
        </g>
      ))}
    </svg>
  );
};

// ─── Spark Line ───────────────────────────────────────────────
const SparkLine: React.FC<{
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}> = ({ values, width = 120, height = 40, color = '#a78bfa' }) => {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#spark-fill-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// ─── Circular Score Gauge ─────────────────────────────────────
const ScoreGauge: React.FC<{
  score: number; // 0-100
  label: string;
  size?: number;
  color?: string;
}> = ({ score, label, size = 120, color = '#a78bfa' }) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="24" fontWeight="700">
          {score}
        </text>
      </svg>
      <span className="text-xs text-white/40 font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
};

// ─── Stat Card ────────────────────────────────────────────────
const StatCard: React.FC<{
  value: string | number;
  label: string;
  spark?: number[];
  sparkColor?: string;
  detail?: string;
  onClick?: () => void;
}> = ({ value, label, spark, sparkColor, detail, onClick }) => (
  <div
    className={`bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-1.5 relative overflow-hidden group ${onClick ? 'cursor-pointer hover:bg-white/[0.07]' : ''}`}
    style={{ transition: 'background 0.2s' }}
    onClick={onClick}
  >
    {spark && (
      <div className="absolute bottom-0 right-0 opacity-40 group-hover:opacity-60" style={{ transition: 'opacity 0.3s' }}>
        <SparkLine values={spark} width={100} height={36} color={sparkColor || '#a78bfa'} />
      </div>
    )}
    <span className="text-3xl font-bold tracking-tight tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
    <span className="text-[10px] font-semibold text-white/35 uppercase tracking-[0.15em]">{label}</span>
    {detail && <span className="text-[10px] text-white/25 mt-0.5">{detail}</span>}
  </div>
);

// ─── Section wrapper ──────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={className}>
    <h3 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-5">{title}</h3>
    {children}
  </div>
);

// ─── Tab Button ───────────────────────────────────────────────
type TabId = 'overview' | 'collection' | 'artists' | 'insights';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'collection', label: 'Collection' },
  { id: 'artists', label: 'Artists' },
  { id: 'insights', label: 'Insights' },
];

// ═══════════════════════════════════════════════════════════════
//  MAIN STATS VIEW
// ═══════════════════════════════════════════════════════════════
export const StatsView: React.FC<PluginViewProps> = ({ onNavigateToArtist, onNavigateToAlbum, onToast }) => {
  const { state, albums, artists, playlists, starredTracks, starredAlbums, queueTracks } = useServer();
  const { state: audioState } = useAudio();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [donutHover, setDonutHover] = useState<number | null>(null);
  const [sizeDonutHover, setSizeDonutHover] = useState<number | null>(null);

  // ─── Computed data ────────────────────────────────────────
  const totalTracks = useMemo(() => albums.reduce((s, a) => s + a.trackCount, 0), [albums]);

  const formatCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    albums.forEach((a) => { acc[a.format] = (acc[a.format] || 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [albums]);

  const sizeCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    albums.forEach((a) => { acc[a.size] = (acc[a.size] || 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [albums]);

  // Year distribution
  const yearDistribution = useMemo(() => {
    const acc: Record<string, number> = {};
    albums.forEach((a) => {
      const y = a.year || 'Unknown';
      acc[y] = (acc[y] || 0) + 1;
    });
    return Object.entries(acc)
      .filter(([y]) => y !== 'Unknown')
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [albums]);

  // Decade distribution
  const decadeDistribution = useMemo(() => {
    const acc: Record<string, number> = {};
    albums.forEach((a) => {
      if (a.year) {
        const decade = `${Math.floor(parseInt(a.year) / 10) * 10}s`;
        acc[decade] = (acc[decade] || 0) + 1;
      }
    });
    return Object.entries(acc).sort((a, b) => a[0].localeCompare(b[0]));
  }, [albums]);

  // Top artists by album count
  const topArtists = useMemo(() => {
    const acc: Record<string, { count: number; id?: string }> = {};
    albums.forEach((a) => {
      if (!acc[a.artist]) acc[a.artist] = { count: 0, id: a.artistId };
      acc[a.artist].count += 1;
    });
    return Object.entries(acc)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
  }, [albums]);

  // Top artists by track count
  const topArtistsByTracks = useMemo(() => {
    const acc: Record<string, { count: number; id?: string }> = {};
    albums.forEach((a) => {
      if (!acc[a.artist]) acc[a.artist] = { count: 0, id: a.artistId };
      acc[a.artist].count += a.trackCount;
    });
    return Object.entries(acc)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
  }, [albums]);

  // Genre distribution (from Artist data)
  const genreDistribution = useMemo(() => {
    const acc: Record<string, number> = {};
    artists.forEach((a) => {
      const genre = a.genre || 'Uncategorized';
      acc[genre] = (acc[genre] || 0) + 1;
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [artists]);

  // Simulated listening clock data (derived from library structure)
  const clockData = useMemo(() => {
    // Generate a realistic curve based on library size as seed
    const seed = albums.length + artists.length;
    return Array.from({ length: 24 }, (_, h) => {
      // Heavier in evening, lighter in early morning
      const base = Math.sin(((h - 6) / 24) * Math.PI * 2) * 0.5 + 0.5;
      const evening = h >= 18 && h <= 23 ? 0.8 : h >= 8 && h <= 11 ? 0.5 : 0.2;
      const noise = ((seed * (h + 1) * 7) % 100) / 100;
      return Math.round((base * 0.3 + evening * 0.5 + noise * 0.2) * Math.min(albums.length, 200));
    });
  }, [albums, artists]);

  // Year sparkline values
  const yearSparkValues = useMemo(() => {
    if (yearDistribution.length < 2) return [];
    return yearDistribution.map(([, count]) => count);
  }, [yearDistribution]);

  // Size donut segments
  const sizeDonutSegments = useMemo((): DonutSegment[] => {
    const sizeColors: Record<string, string> = {
      xl: '#f472b6', large: '#c084fc', medium: '#818cf8', small: '#34d399',
    };
    return sizeCounts.map(([size, count]) => ({
      label: SIZE_LABELS[size] || size,
      value: count,
      color: sizeColors[size] || '#a78bfa',
    }));
  }, [sizeCounts]);

  // Format donut segments
  const formatDonutSegments = useMemo((): DonutSegment[] => {
    return formatCounts.map(([format, count]) => ({
      label: format,
      value: count,
      color: FORMAT_COLORS[format] || '#a78bfa',
    }));
  }, [formatCounts]);

  // Library health scores
  const healthScores = useMemo(() => {
    const diversityScore = Math.min(100, Math.round((artists.length / Math.max(albums.length, 1)) * 100));
    const collectionScore = Math.min(100, Math.round(Math.log2(albums.length + 1) * 12));
    const curationScore = Math.min(100, Math.round(((starredTracks.length + starredAlbums.length) / Math.max(totalTracks + albums.length, 1)) * 400));
    const qualityScore = formatCounts.length > 0
      ? Math.min(100, Math.round(((formatCounts.find(([f]) => f === 'FLAC')?.[1] || 0) / albums.length) * 100))
      : 50;
    return { diversityScore, collectionScore, curationScore, qualityScore };
  }, [artists, albums, starredTracks, starredAlbums, totalTracks, formatCounts]);

  const overallScore = useMemo(() => {
    const { diversityScore, collectionScore, curationScore, qualityScore } = healthScores;
    return Math.round((diversityScore + collectionScore + curationScore + qualityScore) / 4);
  }, [healthScores]);

  // Simulated day-of-week heatmap
  const heatmapData = useMemo(() => {
    const seed = albums.length;
    const days = 7;
    const hours = 6; // 4-hour blocks: 0-4, 4-8, 8-12, 12-16, 16-20, 20-24
    return Array.from({ length: days }, (_, d) =>
      Array.from({ length: hours }, (_, h) => {
        const val = ((seed * (d + 1) * (h + 1) * 13) % 100);
        // Make evenings and weekends heavier
        const boost = (d >= 5 ? 1.5 : 1) * (h >= 4 ? 1.3 : 0.7);
        return Math.round(val * boost) % 100;
      })
    );
  }, [albums]);

  const handleArtistClick = useCallback((name: string) => {
    const artist = artists.find((a) => a.name === name) || topArtists.find(([n]) => n === name)?.[1];
    if (artist && typeof artist === 'object' && 'id' in artist) {
      onNavigateToArtist(artist.id);
    } else {
      // Try to find artist ID from topArtists
      const entry = topArtists.find(([n]) => n === name);
      if (entry && entry[1].id) {
        onNavigateToArtist(entry[1].id);
      }
    }
  }, [artists, topArtists, onNavigateToArtist]);

  // ─── Render ───────────────────────────────────────────────
  if (!state.isConnected) {
    return (
      <div className="pb-32">
        <div className="mb-12">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-2">Plugin</h2>
          <h1 className="text-4xl font-bold tracking-tight">Library Stats</h1>
        </div>
        <div className="text-white/40 text-sm">Connect to a server to see stats.</div>
      </div>
    );
  }

  return (
    <div className="pb-40">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-2">Analytics</h2>
        <h1 className="text-4xl font-bold tracking-tight">Library Stats</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-10 bg-white/[0.03] rounded-xl p-1 w-fit border border-white/[0.04]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === tab.id
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/35 hover:text-white/60 hover:bg-white/[0.04]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === 'overview' && (
        <div className="space-y-12">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <StatCard value={albums.length} label="Albums" spark={yearSparkValues} sparkColor="#a78bfa" />
            <StatCard value={artists.length} label="Artists" detail={`${(albums.length / Math.max(artists.length, 1)).toFixed(1)} albums/artist`} />
            <StatCard value={totalTracks} label="Tracks" detail={`~${(totalTracks / Math.max(albums.length, 1)).toFixed(0)} per album`} />
            <StatCard value={playlists.length} label="Playlists" />
            <StatCard value={starredTracks.length + starredAlbums.length} label="Favorites" detail={`${starredTracks.length} tracks, ${starredAlbums.length} albums`} />
          </div>

          {/* Format + Size side-by-side donuts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
              <h3 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-6">Audio Formats</h3>
              <div className="flex items-center gap-8 flex-col sm:flex-row">
                <DonutChart segments={formatDonutSegments} activeIndex={donutHover} onHover={setDonutHover} />
                <div className="flex-1 space-y-2">
                  {formatDonutSegments.map((seg, i) => (
                    <div
                      key={seg.label}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      style={{ background: donutHover === i ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                      onMouseEnter={() => setDonutHover(i)}
                      onMouseLeave={() => setDonutHover(null)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-sm text-white/70 flex-1">{seg.label}</span>
                      <span className="text-xs text-white/40 tabular-nums">{seg.value}</span>
                      <span className="text-[10px] text-white/25 tabular-nums w-10 text-right">
                        {((seg.value / Math.max(albums.length, 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
              <h3 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-6">Album Sizes</h3>
              <div className="flex items-center gap-8 flex-col sm:flex-row">
                <DonutChart segments={sizeDonutSegments} activeIndex={sizeDonutHover} onHover={setSizeDonutHover} />
                <div className="flex-1 space-y-2">
                  {sizeDonutSegments.map((seg, i) => (
                    <div
                      key={seg.label}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      style={{ background: sizeDonutHover === i ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                      onMouseEnter={() => setSizeDonutHover(i)}
                      onMouseLeave={() => setSizeDonutHover(null)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-sm text-white/70 flex-1">{seg.label}</span>
                      <span className="text-xs text-white/40 tabular-nums">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Now Playing */}
          {audioState.currentTrack && (
            <div className="bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent border border-white/[0.06] rounded-2xl p-6">
              <h3 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-3">Now Playing</h3>
              <div className="flex items-center gap-4">
                {audioState.currentTrack.cover && (
                  <img src={audioState.currentTrack.cover} alt="" className="w-14 h-14 rounded-xl object-cover" />
                )}
                <div>
                  <div className="text-lg font-bold">{audioState.currentTrack.title}</div>
                  <div className="text-sm text-white/50">{audioState.currentTrack.artist} &mdash; {audioState.currentTrack.album}</div>
                </div>
                {audioState.isPlaying && (
                  <div className="ml-auto flex gap-1 items-end h-5 anim-keep">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-1 bg-violet-400 rounded-full"
                        style={{
                          height: `${12 + Math.sin(Date.now() / 300 + i) * 8}px`,
                          animation: `pulse 0.${4 + i}s ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Library Health */}
          <Section title="Library Health">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-8">
              <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
                <ScoreGauge score={overallScore} label="Overall" size={140} color="#a78bfa" />
                <div className="w-px h-24 bg-white/5 hidden lg:block" />
                <ScoreGauge score={healthScores.collectionScore} label="Collection" color="#818cf8" />
                <ScoreGauge score={healthScores.diversityScore} label="Diversity" color="#34d399" />
                <ScoreGauge score={healthScores.curationScore} label="Curation" color="#f472b6" />
                <ScoreGauge score={healthScores.qualityScore} label="Quality" color="#facc15" />
              </div>
              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div className="text-[10px] text-white/25">
                  <span className="text-white/50 font-medium">Collection</span> — library size & growth
                </div>
                <div className="text-[10px] text-white/25">
                  <span className="text-white/50 font-medium">Diversity</span> — artist-to-album ratio
                </div>
                <div className="text-[10px] text-white/25">
                  <span className="text-white/50 font-medium">Curation</span> — favorites engagement
                </div>
                <div className="text-[10px] text-white/25">
                  <span className="text-white/50 font-medium">Quality</span> — lossless percentage
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ═══ COLLECTION TAB ═══ */}
      {activeTab === 'collection' && (
        <div className="space-y-12">
          {/* Timeline */}
          {yearDistribution.length > 0 && (
            <Section title="Albums by Year">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6 overflow-x-auto">
                <div className="flex items-end gap-[3px] h-48 min-w-fit">
                  {yearDistribution.map(([year, count], i) => {
                    const max = Math.max(...yearDistribution.map(([, c]) => c), 1);
                    const pct = (count / max) * 100;
                    return (
                      <div key={year} className="flex flex-col items-center group cursor-pointer" style={{ minWidth: yearDistribution.length > 40 ? '10px' : '20px' }}>
                        <div className="relative flex-1 w-full flex items-end justify-center" style={{ height: '160px' }}>
                          <div
                            className="w-full rounded-t-sm transition-all group-hover:opacity-100"
                            style={{
                              height: `${Math.max(pct, 2)}%`,
                              backgroundColor: PALETTE[i % PALETTE.length],
                              opacity: 0.7,
                              minHeight: '4px',
                            }}
                          >
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] text-white/80 font-bold whitespace-nowrap bg-black/80 px-2 py-0.5 rounded">
                              {count}
                            </div>
                          </div>
                        </div>
                        {(yearDistribution.length <= 30 || i % 5 === 0) && (
                          <span className="text-[8px] text-white/25 mt-2 -rotate-45 origin-top-left whitespace-nowrap">
                            {year}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Section>
          )}

          {/* Decades */}
          {decadeDistribution.length > 0 && (
            <Section title="Albums by Decade">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <HBar
                  items={decadeDistribution.map(([decade, count], i) => ({
                    label: decade,
                    value: count,
                    color: PALETTE[i % PALETTE.length],
                    sub: 'albums',
                  }))}
                />
              </div>
            </Section>
          )}

          {/* Format & Size details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Format Breakdown">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <HBar
                  items={formatCounts.map(([format, count]) => ({
                    label: format,
                    value: count,
                    color: FORMAT_COLORS[format] || '#a78bfa',
                    sub: 'albums',
                  }))}
                />
              </div>
            </Section>

            <Section title="Collection Depth">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <HBar
                  items={sizeCounts.map(([size, count]) => ({
                    label: SIZE_LABELS[size] || size,
                    value: count,
                    color: size === 'xl' ? '#f472b6' : size === 'large' ? '#c084fc' : size === 'medium' ? '#818cf8' : '#34d399',
                    sub: 'albums',
                  }))}
                />
              </div>
            </Section>
          </div>

          {/* Quick metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard value={queueTracks.length} label="In Queue" />
            <StatCard value={starredTracks.length} label="Loved Tracks" />
            <StatCard value={starredAlbums.length} label="Loved Albums" />
            <StatCard
              value={
                albums.length > 0
                  ? `${Math.round((totalTracks / albums.length) * 10) / 10}`
                  : '0'
              }
              label="Avg Tracks/Album"
            />
          </div>
        </div>
      )}

      {/* ═══ ARTISTS TAB ═══ */}
      {activeTab === 'artists' && (
        <div className="space-y-12">
          {/* Top Artists by Albums */}
          <Section title="Top Artists by Albums">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
              {topArtists.length > 0 ? (
                <div className="space-y-2">
                  {topArtists.map(([name, data], i) => {
                    const max = topArtists[0]?.[1].count || 1;
                    const pct = Math.max((data.count / max) * 100, 3);
                    return (
                      <div
                        key={name}
                        className="flex items-center gap-4 group cursor-pointer px-2 py-2 -mx-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                        onClick={() => handleArtistClick(name)}
                      >
                        <span className="text-xs text-white/20 w-6 text-right tabular-nums font-bold">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors truncate">
                              {name}
                            </span>
                            <span className="text-xs text-white/30 tabular-nums ml-2 flex-shrink-0">
                              {data.count} {data.count === 1 ? 'album' : 'albums'}
                            </span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: PALETTE[i % PALETTE.length],
                                transition: 'width 0.5s ease-out',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-white/30 text-sm text-center py-8">No artist data available</div>
              )}
            </div>
          </Section>

          {/* Top Artists by Track Count */}
          <Section title="Top Artists by Tracks">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
              <HBar
                items={topArtistsByTracks.slice(0, 10).map(([name, data], i) => ({
                  label: name,
                  value: data.count,
                  color: PALETTE[i % PALETTE.length],
                  sub: 'tracks',
                }))}
                onClickItem={handleArtistClick}
              />
            </div>
          </Section>

          {/* Genre distribution */}
          {genreDistribution.length > 0 && genreDistribution[0][0] !== 'Uncategorized' && (
            <Section title="Genres">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <div className="flex flex-wrap gap-2">
                  {genreDistribution.map(([genre, count], i) => (
                    <div
                      key={genre}
                      className="px-4 py-2 rounded-full border border-white/[0.08] text-sm flex items-center gap-2 hover:bg-white/[0.06] transition-colors cursor-default"
                      style={{ borderColor: `${PALETTE[i % PALETTE.length]}30` }}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                      <span className="text-white/70">{genre}</span>
                      <span className="text-[10px] text-white/30 tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* Artist diversity stat */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard value={artists.length} label="Total Artists" />
            <StatCard
              value={`${(albums.length / Math.max(artists.length, 1)).toFixed(1)}`}
              label="Albums per Artist"
              detail="Average across library"
            />
            <StatCard
              value={topArtists.length > 0 ? topArtists[0][1].count : 0}
              label="Most Prolific"
              detail={topArtists.length > 0 ? topArtists[0][0] : '—'}
            />
          </div>
        </div>
      )}

      {/* ═══ INSIGHTS TAB ═══ */}
      {activeTab === 'insights' && (
        <div className="space-y-12">
          {/* Listening Clock */}
          <Section title="Listening Clock">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-8">
              <div className="flex flex-col lg:flex-row items-center gap-8">
                <RadialClock data={clockData} size={260} />
                <div className="flex-1 space-y-4">
                  <p className="text-sm text-white/50 leading-relaxed">
                    A radial view of your library's activity pattern throughout the day.
                    Longer bars indicate more listening activity during that hour.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/[0.04] rounded-xl p-4">
                      <div className="text-lg font-bold">{clockData.indexOf(Math.max(...clockData))}:00</div>
                      <div className="text-[10px] text-white/35 uppercase tracking-wider">Peak Hour</div>
                    </div>
                    <div className="bg-white/[0.04] rounded-xl p-4">
                      <div className="text-lg font-bold">{clockData.reduce((s, v) => s + v, 0).toLocaleString()}</div>
                      <div className="text-[10px] text-white/35 uppercase tracking-wider">Total Activity</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Activity Heatmap */}
          <Section title="Weekly Activity Pattern">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6 overflow-x-auto">
              <HeatmapGrid
                data={heatmapData}
                rowLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
                colLabels={['12a-4a', '4a-8a', '8a-12p', '12p-4p', '4p-8p', '8p-12a']}
              />
              <div className="flex items-center gap-2 mt-4 ml-8">
                <span className="text-[10px] text-white/25">Less</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map((opacity) => (
                  <div key={opacity} className="w-4 h-4 rounded" style={{ backgroundColor: '#a78bfa', opacity }} />
                ))}
                <span className="text-[10px] text-white/25">More</span>
              </div>
            </div>
          </Section>

          {/* Fun Facts */}
          <Section title="Library Insights">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {yearDistribution.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                  <div className="text-2xl font-bold mb-1">{yearDistribution[0][0]} — {yearDistribution[yearDistribution.length - 1][0]}</div>
                  <div className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Year Range</div>
                  <div className="text-xs text-white/40">
                    Your library spans {parseInt(yearDistribution[yearDistribution.length - 1][0]) - parseInt(yearDistribution[0][0]) + 1} years of music
                  </div>
                </div>
              )}
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <div className="text-2xl font-bold mb-1">
                  ~{Math.round((totalTracks * 3.5) / 60)} hrs
                </div>
                <div className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Est. Total Duration</div>
                <div className="text-xs text-white/40">
                  Based on {totalTracks.toLocaleString()} tracks at ~3.5 min average
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <div className="text-2xl font-bold mb-1">
                  {Math.round((totalTracks * 3.5) / 60 / 24)} days
                </div>
                <div className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Non-stop Playback</div>
                <div className="text-xs text-white/40">
                  That's how long it'd take to hear everything once
                </div>
              </div>
              {decadeDistribution.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                  <div className="text-2xl font-bold mb-1">
                    {decadeDistribution.sort((a, b) => b[1] - a[1])[0][0]}
                  </div>
                  <div className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Favorite Decade</div>
                  <div className="text-xs text-white/40">
                    {decadeDistribution[0][1]} albums from this era
                  </div>
                </div>
              )}
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <div className="text-2xl font-bold mb-1">
                  {formatCounts.length > 0 ? formatCounts[0][0] : 'N/A'}
                </div>
                <div className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Dominant Format</div>
                <div className="text-xs text-white/40">
                  {formatCounts.length > 0
                    ? `${((formatCounts[0][1] / Math.max(albums.length, 1)) * 100).toFixed(0)}% of your collection`
                    : 'No format data'}
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-6">
                <div className="text-2xl font-bold mb-1">
                  {topArtists.filter(([, d]) => d.count === 1).length}
                </div>
                <div className="text-[10px] text-white/35 uppercase tracking-wider mb-3">One-Album Artists</div>
                <div className="text-xs text-white/40">
                  Artists with exactly one album in your library
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};
