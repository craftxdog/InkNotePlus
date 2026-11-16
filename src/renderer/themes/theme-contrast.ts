export type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

export function compositeColor(color: Rgba, background: Rgb): Rgb {
  return [
    color[0] * color[3] + background[0] * (1 - color[3]),
    color[1] * color[3] + background[1] * (1 - color[3]),
    color[2] * color[3] + background[2] * (1 - color[3]),
  ];
}

function luminance(color: Rgb) {
  const channels = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(a: Rgb, b: Rgb) {
  const left = luminance(a),
    right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

// Mix only with black or white to retain the original hue. Return an opaque
// color only when the theme's rendered foreground needs stronger contrast.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
export function readableColor(
  foreground: Rgba,
  backgrounds: readonly Rgb[],
): Rgb | null {
  if (
    !backgrounds.length ||
    backgrounds.every(
      (background) =>
        contrastRatio(compositeColor(foreground, background), background) >=
        4.5,
    )
  )
    return null;
  const start = compositeColor(foreground, backgrounds[0]);
  const score = (color: Rgb) =>
    Math.min(
      ...backgrounds.map((background) => contrastRatio(color, background)),
    );
  const black: Rgb = [0, 0, 0],
    white: Rgb = [255, 255, 255];
  const end = score(black) > score(white) ? black : white;
  let low = 0,
    high = 1;
  const mix = (amount: number): Rgb => [
    Math.round(start[0] + (end[0] - start[0]) * amount),
    Math.round(start[1] + (end[1] - start[1]) * amount),
    Math.round(start[2] + (end[2] - start[2]) * amount),
  ];
  for (let attempt = 0; attempt < 16; attempt++) {
    const middle = (low + high) / 2;
    if (score(mix(middle)) >= 4.55) high = middle;
    else low = middle;
  }
  return mix(high);
}

export function createThemeContrastStyle(document: Document, nonce: string) {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
  root.append(probe);
  let colorContext: CanvasRenderingContext2D | null | undefined;
  const read = (token: string, background = false): Rgba | null => {
    if (!computed.getPropertyValue(token).trim()) return null;
    probe.style.color = `var(${token})`;
    probe.style.background = background ? `var(${token})` : 'transparent';
    const style = getComputedStyle(probe);
    const color = background ? style.backgroundColor : style.color;
    const value = color
      .match(/^rgba?\(([^)]+)\)$/)?.[1]
      .split(',')
      .map(Number);
    if (value && value.length >= 3)
      return [value[0], value[1], value[2], value[3] ?? 1];
    // Modern CSS colors can remain color(srgb ...), oklch() or color-mix()
    // after getComputedStyle(). Let the browser convert them to sRGB rather
    // than silently treating an unreadable selected background as transparent.
    if (colorContext === undefined) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      colorContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!colorContext) return null;
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = color;
    colorContext.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = colorContext.getImageData(
      0,
      0,
      1,
      1,
    ).data;
    return [red, green, blue, alpha / 255];
  };
  try {
    const page = read('--page-background', true);
    if (!page) return null;
    const base = compositeColor(page, [255, 255, 255]);
    const surface = (token: string, parent = base) =>
      compositeColor(read(token, true) ?? [0, 0, 0, 0], parent);
    const backgrounds = (...tokens: string[]) =>
      tokens.map((token) => surface(token));
    const sidebar = surface('--sidebar-background');
    const noteList = surface('--note-list-bar-background');
    const preview = surface('--editor-background');
    const ui = backgrounds(
      '--page-background',
      '--sidebar-background',
      '--note-list-bar-background',
      '--input-background',
      '--popup-background',
    );
    const selectedRegions: [string, Rgb][] = [
      [
        '.note-list-item[data-active="true"]',
        surface('--note-list-view-item-active-background', noteList),
      ],
      [
        '.navigation-item[data-active="true"], .notebook-row[data-active="true"]',
        surface('--sidebar-menu-item-active-background', sidebar),
      ],
      [
        '.preferences-navigation button[aria-selected="true"]',
        surface(
          '--preferences-sidebar-item-active-background',
          surface('--preferences-sidebar-background'),
        ),
      ],
    ];
    const editor = compositeColor(
      read('--editor-background-color', true) ?? page,
      base,
    );
    const completion = surface('--editor-tooltip-background-color', editor);
    // The selection layer sits below line decorations and inline-code pills.
    // Check both focus states and the active-line overlay in that paint order.
    const editorSurfaces = [
      editor,
      surface('--editor-selection-background', editor),
      surface('--editor-focused-selection-background', editor),
    ].flatMap((background) => [
      background,
      surface('--editor-active-line-background-color', background),
      surface('--md-inline-code-background-color', background),
    ]);
    const syntax = [
      ...editorSurfaces,
      surface('--mde-preview-codeblock-background-color', preview),
      surface('--mde-preview-inline-code-background-color', preview),
      surface('--mde-preview-table-head-background-color', preview),
      surface('--mde-preview-table-row-background-color', preview),
    ];
    const groups: [string[], Rgb[]][] = [
      [
        [
          '--text-color',
          '--muted-text-color',
          '--unselected-text-color',
          '--link-color',
          '--input-color',
          '--input-placeholder-color',
        ],
        ui,
      ],
      [
        ['--button-text-color'],
        [
          surface('--button-background'),
          surface('--button-hover-background-color'),
        ],
      ],
      [
        [
          '--sidebar-menu-item-color',
          '--sidebar-menu-section-color',
          '--sidebar-sync-status-view-text-color',
          '--sidebar-sync-status-view-detail-color',
        ],
        [sidebar],
      ],
      [
        ['--sidebar-menu-active-item-color'],
        [surface('--sidebar-menu-item-active-background', sidebar)],
      ],
      [
        [
          '--note-list-view-item-header-color',
          '--note-list-view-item-color',
          '--note-list-view-item-date-color',
        ],
        [
          noteList,
          surface('--note-list-view-item-selected-background', noteList),
        ],
      ],
      [['--editor-foreground-color'], editorSurfaces],
      [
        [
          '--editor-completion-label',
          '--editor-completion-detail-color',
          '--editor-completion-matched-text-color',
        ],
        [completion],
      ],
      [
        ['--editor-tooltip-autocomplete-item-selected-color'],
        [
          surface(
            '--editor-tooltip-autocomplete-item-selected-background-color',
            completion,
          ),
        ],
      ],
      [
        ['--editor-gutter-color'],
        [
          editor,
          compositeColor(
            read('--editor-active-line-gutter-background-color', true) ?? [
              0, 0, 0, 0,
            ],
            editor,
          ),
        ],
      ],
      [
        [...computed].filter(
          (token) =>
            /^--(?:syntax|md)-.*color$/.test(token) &&
            !/background|border|underline|decoration/.test(token),
        ),
        syntax,
      ],
      [
        [...computed].filter((token) =>
          /^(?:--gfm-alert-|--mde-preview-.*(?:text-color|heading-color|em-color|strong-color|link-color|marker-color)$)/.test(
            token,
          ),
        ),
        [
          preview,
          ...editorSurfaces,
          surface('--mde-preview-table-head-background-color', preview),
          surface('--mde-preview-table-row-background-color', preview),
        ],
      ],
    ];
    const appearance = root.style.colorScheme === 'dark' ? 'dark' : 'light';
    const tagTokens = [...computed].filter(
      (token) =>
        token.startsWith(`--tag-${appearance}-`) &&
        token.endsWith('-text-color'),
    );
    for (const token of tagTokens) {
      const background = token.replace(/-text-color$/, '-background-color');
      groups.push([
        [token],
        [base, sidebar, noteList, preview].map((parent) =>
          surface(background, parent),
        ),
      ]);
    }
    const rules: string[] = [];
    for (const [tokens, surfaces] of groups) {
      for (const token of tokens) {
        const original = read(token);
        const color = original && readableColor(original, surfaces);
        if (color) rules.push(`${token}:rgb(${color.join(',')})`);
      }
    }
    // A single foreground cannot always contrast with both a bright active row
    // and a dark preferences tab. Resolve selected text and tag colors in their
    // actual component context, preserving the theme's background and hue.
    const scoped = selectedRegions.map(([selector, background]) => {
      const declarations: string[] = [];
      for (const token of ['--selected-text-color', ...tagTokens]) {
        const original = read(token);
        if (!original) continue;
        const target =
          token === '--selected-text-color'
            ? background
            : surface(
                token.replace(/-text-color$/, '-background-color'),
                background,
              );
        const color =
          readableColor(original, [target]) ?? compositeColor(original, target);
        declarations.push(`${token}:rgb(${color.join(',')})`);
      }
      return `${selector}{${declarations.join(';')}}`;
    });
    if (!rules.length && !scoped.length) return null;
    const style = document.createElement('style');
    style.nonce = nonce;
    style.dataset.themeContrast = '';
    // User styles outside a cascade layer keep their documented priority.
    style.textContent = `@layer theme { :root { ${rules.join(';')} } ${scoped.join('\n')} }`;
    return style;
  } finally {
    probe.remove();
  }
}
