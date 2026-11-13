/*!
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
// SVG geometry from lucide-react 1.66.0. Kept as small, static DOM data so
// CodeMirror options do not mount a React root or load an icon font.
export const completionIcons = {
  code: [
    [
      'path',
      {
        d: 'm16 18 6-6-6-6',
      },
    ],
    [
      'path',
      {
        d: 'm8 6-6 6 6 6',
      },
    ],
  ],
  heading: [
    [
      'path',
      {
        d: 'm2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16',
      },
    ],
    [
      'path',
      {
        d: 'M22 9v7',
      },
    ],
    [
      'path',
      {
        d: 'M3.304 13h6.392',
      },
    ],
    ['circle', { cx: '18.5', cy: '12.5', r: '3.5' }],
  ],
  rule: [
    [
      'path',
      {
        d: 'M5 12h14',
      },
    ],
  ],
  ordered: [
    [
      'path',
      {
        d: 'M11 5h10',
      },
    ],
    [
      'path',
      {
        d: 'M11 12h10',
      },
    ],
    [
      'path',
      {
        d: 'M11 19h10',
      },
    ],
    [
      'path',
      {
        d: 'M4 4h1v5',
      },
    ],
    [
      'path',
      {
        d: 'M4 9h2',
      },
    ],
    [
      'path',
      {
        d: 'M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02',
      },
    ],
  ],
  table: [
    [
      'path',
      {
        d: 'M3 9h18',
      },
    ],
    [
      'path',
      {
        d: 'M9 3v18',
      },
    ],
    [
      'rect',
      {
        x: '3',
        y: '3',
        width: '18',
        height: '18',
        rx: '2',
      },
    ],
  ],
  tasks: [
    [
      'rect',
      {
        width: '18',
        height: '18',
        x: '3',
        y: '3',
        rx: '2',
      },
    ],
    [
      'path',
      {
        d: 'm16 9-5.5 5.5L8 12',
      },
    ],
  ],
  unordered: [
    [
      'path',
      {
        d: 'M3 5h.01',
      },
    ],
    [
      'path',
      {
        d: 'M3 12h.01',
      },
    ],
    [
      'path',
      {
        d: 'M3 19h.01',
      },
    ],
    [
      'path',
      {
        d: 'M8 5h13',
      },
    ],
    [
      'path',
      {
        d: 'M8 12h13',
      },
    ],
    [
      'path',
      {
        d: 'M8 19h13',
      },
    ],
  ],
  quote: [
    [
      'path',
      {
        d: 'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
      },
    ],
    [
      'path',
      {
        d: 'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
      },
    ],
  ],
  image: [
    [
      'rect',
      {
        width: '18',
        height: '18',
        x: '3',
        y: '3',
        rx: '2',
        ry: '2',
      },
    ],
    [
      'circle',
      {
        cx: '9',
        cy: '9',
        r: '2',
      },
    ],
    [
      'path',
      {
        d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
      },
    ],
  ],
  noteLink: [
    [
      'path',
      {
        d: 'M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7',
      },
    ],
    [
      'path',
      {
        d: 'M14 2v5a1 1 0 0 0 1 1h5',
      },
    ],
    [
      'path',
      {
        d: 'm10 18 3-3-3-3',
      },
    ],
  ],
  note: [
    [
      'circle',
      {
        cx: '12',
        cy: '12',
        r: '10',
      },
    ],
    [
      'path',
      {
        d: 'M12 16v-4',
      },
    ],
    [
      'path',
      {
        d: 'M12 8h.01',
      },
    ],
  ],
  tip: [
    [
      'path',
      {
        d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
      },
    ],
    [
      'path',
      {
        d: 'M9 18h6',
      },
    ],
    [
      'path',
      {
        d: 'M10 22h4',
      },
    ],
  ],
  important: [
    [
      'path',
      {
        d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
      },
    ],
    [
      'path',
      {
        d: 'M12 15h.01',
      },
    ],
    [
      'path',
      {
        d: 'M12 7v4',
      },
    ],
  ],
  warning: [
    [
      'path',
      {
        d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
      },
    ],
    [
      'path',
      {
        d: 'M12 9v4',
      },
    ],
    [
      'path',
      {
        d: 'M12 17h.01',
      },
    ],
  ],
  caution: [
    [
      'path',
      {
        d: 'M12 16h.01',
      },
    ],
    [
      'path',
      {
        d: 'M12 8v4',
      },
    ],
    [
      'path',
      {
        d: 'M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z',
      },
    ],
  ],
} as const;
