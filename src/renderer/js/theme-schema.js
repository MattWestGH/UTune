/**
 * Every knob in the customiser lives here. The customiser UI is generated from
 * this schema and theme.js turns the same schema into CSS custom properties,
 * so adding a new control means adding one entry - nothing else.
 *
 * field.type: color | range | select | toggle | text | font | background
 */
window.THEME_SCHEMA = [
  {
    id: 'palette',
    title: 'Colours',
    icon: '◑',
    blurb: 'Every surface, every accent. Nothing is off limits.',
    fields: [
      { key: 'text', label: 'Text', type: 'color', css: '--text', def: '#f2eefb' },
      { key: 'textDim', label: 'Muted text', type: 'color', css: '--text-dim', def: '#a79fbd' },
      { key: 'accent', label: 'Accent', type: 'color', css: '--accent', def: '#c084fc' },
      { key: 'accent2', label: 'Accent 2', type: 'color', css: '--accent-2', def: '#f0abfc' },
      { key: 'onAccent', label: 'On accent', type: 'color', css: '--on-accent', def: '#150c22' },
      { key: 'surface', label: 'Panels', type: 'color', css: '--surface', def: '#141020' },
      { key: 'surface2', label: 'Cards & rows', type: 'color', css: '--surface-2', def: '#1c1630' },
      { key: 'surfaceHover', label: 'Hover', type: 'color', css: '--surface-hover', def: '#272040' },
      { key: 'border', label: 'Borders', type: 'color', css: '--border', def: '#392f55' },
      { key: 'borderHover', label: 'Border hover', type: 'color', css: '--border-hover', def: '#6d5aa8' },
      { key: 'sidebarBg', label: 'Sidebar', type: 'color', css: '--sidebar-bg', def: '#100c1c' },
      { key: 'sidebarText', label: 'Sidebar text', type: 'color', css: '--sidebar-text', def: '#b7aed0' },
      { key: 'sidebarActive', label: 'Sidebar active', type: 'color', css: '--sidebar-active', def: '#c084fc' },
      { key: 'headerBg', label: 'Title bar', type: 'color', css: '--header-bg', def: '#0e0a18' },
      { key: 'playerBg', label: 'Player bar', type: 'color', css: '--player-bg', def: '#120e20' },
      { key: 'progressTrack', label: 'Slider rail', type: 'color', css: '--progress-track', def: '#3a3055' },
      { key: 'progressFill', label: 'Slider fill', type: 'color', css: '--progress-fill', def: '#c084fc' },
      { key: 'knob', label: 'Slider knob', type: 'color', css: '--knob', def: '#ffffff' },
      { key: 'heart', label: 'Loved icon', type: 'color', css: '--heart', def: '#fb7185' },
      { key: 'shadowColor', label: 'Shadow', type: 'color', css: '--shadow-color', def: '#000000' },
      { key: 'glowColor', label: 'Glow', type: 'color', css: '--glow-color', def: '#c084fc' },
      { key: 'scrollbar', label: 'Scrollbar', type: 'color', css: '--scrollbar', def: '#4a3d70' },
      { key: 'selection', label: 'Text selection', type: 'color', css: '--selection', def: '#7c3aed' },
    ],
  },

  {
    id: 'type',
    title: 'Typography',
    icon: 'Aa',
    blurb: 'Use any font installed on this PC, or drop in a font file.',
    fields: [
      { key: 'fontBody', label: 'Body font', type: 'font', css: '--font-body', def: 'Segoe UI' },
      { key: 'fontHeading', label: 'Heading font', type: 'font', css: '--font-heading', def: 'Segoe UI' },
      { key: 'fontSize', label: 'Base size', type: 'range', css: '--font-size', def: 14, min: 11, max: 20, step: 0.5, unit: 'px' },
      { key: 'fontWeight', label: 'Body weight', type: 'range', css: '--font-weight', def: 400, min: 100, max: 900, step: 100 },
      { key: 'headingWeight', label: 'Heading weight', type: 'range', css: '--heading-weight', def: 700, min: 100, max: 900, step: 100 },
      { key: 'headingScale', label: 'Heading scale', type: 'range', css: '--heading-scale', def: 1.9, min: 1, max: 3.4, step: 0.05 },
      { key: 'letterSpacing', label: 'Letter spacing', type: 'range', css: '--letter-spacing', def: 0, min: -1, max: 6, step: 0.1, unit: 'px' },
      { key: 'headingSpacing', label: 'Heading spacing', type: 'range', css: '--heading-spacing', def: -0.5, min: -2, max: 12, step: 0.1, unit: 'px' },
      { key: 'lineHeight', label: 'Line height', type: 'range', css: '--line-height', def: 1.5, min: 1, max: 2.2, step: 0.05 },
      { key: 'headingCase', label: 'Heading case', type: 'select', css: '--heading-case', def: 'none',
        options: [['none', 'Normal'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalise']] },
      { key: 'uiCase', label: 'Menu case', type: 'select', css: '--ui-case', def: 'none',
        options: [['none', 'Normal'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase']] },
      { key: 'fontSmoothing', label: 'Crisp text', type: 'toggle', def: true },
    ],
  },

  {
    id: 'shape',
    title: 'Shape & borders',
    icon: '◻',
    blurb: 'Round it off, square it up, or outline everything.',
    fields: [
      { key: 'radius', label: 'Corner radius', type: 'range', css: '--radius', def: 10, min: 0, max: 32, step: 1, unit: 'px' },
      { key: 'cardRadius', label: 'Card radius', type: 'range', css: '--card-radius', def: 14, min: 0, max: 40, step: 1, unit: 'px' },
      { key: 'buttonRadius', label: 'Button radius', type: 'range', css: '--button-radius', def: 999, min: 0, max: 999, step: 1, unit: 'px' },
      { key: 'coverRadius', label: 'Artwork radius', type: 'range', css: '--cover-radius', def: 10, min: 0, max: 200, step: 1, unit: 'px' },
      { key: 'borderWidth', label: 'Border width', type: 'range', css: '--border-width', def: 1, min: 0, max: 8, step: 0.5, unit: 'px' },
      { key: 'borderStyle', label: 'Border style', type: 'select', css: '--border-style', def: 'solid',
        options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double'], ['groove', 'Groove'], ['ridge', 'Ridge'], ['none', 'None']] },
      { key: 'coverBorder', label: 'Artwork border', type: 'range', css: '--cover-border', def: 0, min: 0, max: 10, step: 0.5, unit: 'px' },
      { key: 'outlineEverything', label: 'Outline every element', type: 'toggle', def: false },
    ],
  },

  {
    id: 'effects',
    title: 'Effects',
    icon: '✧',
    blurb: 'Glass, glow, grain and motion.',
    fields: [
      { key: 'surfaceOpacity', label: 'Panel opacity', type: 'range', css: '--surface-opacity', def: 0.86, min: 0, max: 1, step: 0.01 },
      { key: 'surfaceBlur', label: 'Frosted glass', type: 'range', css: '--surface-blur', def: 14, min: 0, max: 40, step: 1, unit: 'px' },
      { key: 'shadowSize', label: 'Shadow size', type: 'range', css: '--shadow-size', def: 24, min: 0, max: 80, step: 1, unit: 'px' },
      { key: 'shadowOpacity', label: 'Shadow strength', type: 'range', css: '--shadow-opacity', def: 0.45, min: 0, max: 1, step: 0.01 },
      { key: 'glowSize', label: 'Accent glow', type: 'range', css: '--glow-size', def: 0, min: 0, max: 50, step: 1, unit: 'px' },
      { key: 'hoverLift', label: 'Hover lift', type: 'range', css: '--hover-lift', def: 2, min: 0, max: 12, step: 0.5, unit: 'px' },
      { key: 'transition', label: 'Animation speed', type: 'range', css: '--transition', def: 180, min: 0, max: 700, step: 10, unit: 'ms' },
      { key: 'grain', label: 'Film grain', type: 'range', css: '--grain', def: 0, min: 0, max: 1, step: 0.01 },
      { key: 'vignette', label: 'Vignette', type: 'range', css: '--vignette', def: 0.25, min: 0, max: 1, step: 0.01 },
      { key: 'appSaturate', label: 'Saturation', type: 'range', css: '--app-saturate', def: 1, min: 0, max: 2.5, step: 0.01 },
      { key: 'appContrast', label: 'Contrast', type: 'range', css: '--app-contrast', def: 1, min: 0.5, max: 1.8, step: 0.01 },
    ],
  },

  {
    id: 'background',
    title: 'Background',
    icon: '▦',
    blurb: 'A colour, a gradient, a photo, a GIF or a looping video.',
    fields: [
      { key: 'bgType', label: 'Type', type: 'select', def: 'gradient',
        options: [['solid', 'Solid colour'], ['gradient', 'Gradient'], ['animated', 'Animated gradient'], ['image', 'Image / GIF'], ['video', 'Video']] },
      { key: 'bgColor1', label: 'Colour A', type: 'color', css: '--bg-1', def: '#120b1f' },
      { key: 'bgColor2', label: 'Colour B', type: 'color', css: '--bg-2', def: '#2a1140' },
      { key: 'bgColor3', label: 'Colour C', type: 'color', css: '--bg-3', def: '#4c1d95' },
      { key: 'gradientType', label: 'Gradient shape', type: 'select', def: 'linear',
        options: [['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']] },
      { key: 'gradientAngle', label: 'Angle', type: 'range', def: 160, min: 0, max: 360, step: 1, unit: 'deg' },
      { key: 'bgAsset', label: 'Image / video', type: 'background', def: '' },
      { key: 'bgFit', label: 'Fit', type: 'select', def: 'cover',
        options: [['cover', 'Cover'], ['contain', 'Contain'], ['tile', 'Tile'], ['center', 'Centre']] },
      { key: 'bgScale', label: 'Zoom', type: 'range', def: 1, min: 1, max: 2.5, step: 0.01 },
      { key: 'bgBlur', label: 'Blur', type: 'range', def: 0, min: 0, max: 60, step: 1, unit: 'px' },
      { key: 'bgOpacity', label: 'Opacity', type: 'range', def: 1, min: 0, max: 1, step: 0.01 },
      { key: 'bgTint', label: 'Tint colour', type: 'color', def: '#000000' },
      { key: 'bgTintOpacity', label: 'Tint strength', type: 'range', def: 0.25, min: 0, max: 1, step: 0.01 },
      { key: 'bgMotion', label: 'Motion', type: 'select', def: 'none',
        options: [['none', 'Still'], ['pan', 'Slow pan'], ['zoom', 'Breathing zoom'], ['drift', 'Drift'], ['sway', 'Sway'], ['spin', 'Spin']] },
      { key: 'bgMotionSpeed', label: 'Motion speed', type: 'range', def: 40, min: 4, max: 120, step: 1, unit: 's' },
      { key: 'bgReactive', label: 'Pulse with the music', type: 'toggle', def: false },
    ],
  },

  {
    id: 'layout',
    title: 'Layout',
    icon: '▥',
    blurb: 'Space it out, or pack it in.',
    fields: [
      { key: 'sidebarWidth', label: 'Sidebar width', type: 'range', css: '--sidebar-w', def: 232, min: 150, max: 380, step: 1, unit: 'px', reflow: true },
      { key: 'playerHeight', label: 'Player height', type: 'range', css: '--player-h', def: 92, min: 70, max: 150, step: 1, unit: 'px', reflow: true },
      { key: 'rowHeight', label: 'Row height', type: 'range', css: '--row-h', def: 46, min: 32, max: 80, step: 1, unit: 'px' },
      { key: 'gap', label: 'Spacing', type: 'range', css: '--gap', def: 16, min: 4, max: 40, step: 1, unit: 'px', reflow: true },
      { key: 'gridSize', label: 'Artwork size', type: 'range', css: '--grid-size', def: 172, min: 110, max: 300, step: 2, unit: 'px' },
      { key: 'showVisualizer', label: 'Show visualiser', type: 'toggle', def: true },
      { key: 'visualStyle', label: 'Visualiser style', type: 'select', def: 'bars',
        options: [['bars', 'Bars'], ['wave', 'Waveform'], ['mirror', 'Mirrored'], ['dots', 'Dots'], ['blocks', 'Blocks']] },
      { key: 'showCoverGlow', label: 'Artwork glow', type: 'toggle', def: true },
      { key: 'brandName', label: 'App name', type: 'text', def: 'UTune' },
    ],
  },
];

window.THEME_FIELDS = window.THEME_SCHEMA.flatMap((g) => g.fields.map((f) => ({ ...f, group: g.id })));

window.THEME_DEFAULTS = window.THEME_FIELDS.reduce((acc, f) => {
  acc[f.key] = f.def;
  return acc;
}, {});
