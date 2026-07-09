/**
 * Shared chart theme — one visual system for every chart in the app.
 *
 * Rules the components follow:
 *  - Money in / income is always leaf green; money out / costs is always clay
 *    red. A series never changes color between pages.
 *  - Same-measure bars use ONE hue (never a rainbow); categorical hues are
 *    assigned in the fixed order below and never cycled.
 *  - Axis money ticks use compact Indian notation (₹1.2L, ₹45K).
 *  - Grids are recessive: horizontal only, warm hairline gray.
 */

// Polarity + role colors
export const LEAF = '#2e7d32';      // income / money in / primary series
export const CLAY = '#c62828';      // costs / money out
export const SKY = '#1976d2';       // secondary informational series
export const INK = '#1A3329';       // emphasis text (matches sidebar)

// Fixed-order categorical palette (validated for lightness, chroma,
// CVD separation and contrast on white). Never reorder per-chart.
export const CATEGORICAL = ['#2e7d32', '#1976d2', '#ed6c02', '#7b1fa2', '#c2185b'];

// Order lifecycle colors — semantic, consistent across the app
export const STATUS_COLORS = {
  pending: '#ed6c02',
  confirmed: '#1976d2',
  preparing: '#7b1fa2',
  ready: '#558b2f',
  dispatched: '#00838f',
  delivered: '#2e7d32',
  completed: '#1A3329',
  cancelled: '#c62828',
};

// Recessive chart chrome
export const GRID_STROKE = '#e8e5df';
export const TICK_STYLE = { fontSize: 12, fill: '#75806f' };
export const AXIS_LINE = { stroke: '#d9d6cf' };

// ₹12.3L / ₹45K — for axis ticks and dense labels
export const compactINR = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);

// ₹12,34,567 — for tooltips and stat values
export const fullINR = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);

// Consistent tooltip card
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid #e8e5df',
    boxShadow: '0 4px 12px rgba(26,51,41,0.12)',
    fontSize: 13,
  },
  labelStyle: { color: INK, fontWeight: 600 },
  cursor: { fill: 'rgba(26,51,41,0.05)' },
};
