import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { colors } from '../tokens.ts';

/**
 * WCAG 2.2 contrast for the colour combinations the app actually uses. Tactiqo has one theme (dark: app.json
 * `userInterfaceStyle: "dark"`), so there is no light-theme table. Translucent "soft" tints are composited over the
 * surface they sit on (cards), as the screen shows them.
 *
 * Targets: normal text 4.5:1 (1.4.3); large text (≥ 18.66 px bold / 24 px) and meaningful icons 3:1 (1.4.3, 1.4.11).
 * Not covered on purpose: disabled controls (exempt in WCAG), decorative illustration colours in games and stories,
 * and input/card borders (see the note in docs/PRE_LAUNCH_SPRINT.md).
 */

type RGB = [number, number, number];

export function parseColor(s: string): { rgb: RGB; alpha: number } {
  if (s.startsWith('#')) {
    const h = s.slice(1);
    return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], alpha: 1 };
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) throw new Error(`unparsed colour ${s}`);
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  return { rgb: [r, g, b], alpha: a };
}

/** A colour (possibly translucent) as it appears over an opaque background. */
export function over(fg: string, bg: RGB | string): RGB {
  const f = parseColor(fg);
  const b = typeof bg === 'string' ? parseColor(bg).rgb : bg;
  return [0, 1, 2].map((i) => f.rgb[i] * f.alpha + b[i] * (1 - f.alpha)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const solid = (c: string): RGB => parseColor(c).rgb;
const SURFACES: Record<string, RGB> = {
  bg: solid(colors.bg),
  bgRaised: solid(colors.bgRaised),
  surface: solid(colors.surface),
  // Pressed rows, selected chips, secondary buttons while pressed.
  surfaceHigh: solid(colors.surfaceHigh),
};
const tint = (name: keyof typeof colors): RGB => over(colors[name], SURFACES.surface);

describe('WCAG calculations', () => {
  it('match the reference values', () => {
    assert.equal(contrast([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00');
    assert.equal(contrast([255, 255, 255], [255, 255, 255]).toFixed(2), '1.00');
    // #767676 on white is the classic 4.54:1.
    assert.equal(contrast(solid('#767676'), [255, 255, 255]).toFixed(2), '4.54');
    assert.deepEqual(over('rgba(255, 255, 255, 0.5)', [0, 0, 0]), [127.5, 127.5, 127.5]);
  });
});

describe('text contrast (4.5:1)', () => {
  const NORMAL_TEXT = ['text', 'textBody', 'textMuted', 'primaryText', 'rivalText', 'insight', 'accent', 'success', 'danger'] as const;

  it('every text colour on every surface it is used on', () => {
    for (const fg of NORMAL_TEXT) {
      for (const [name, bg] of Object.entries(SURFACES)) {
        const r = contrast(solid(colors[fg]), bg);
        assert.ok(r >= 4.5, `${fg} on ${name}: ${r.toFixed(2)}`);
      }
    }
  });

  it('the dimmest text (placeholders, hints) on the page and card surfaces', () => {
    for (const name of ['bg', 'bgRaised', 'surface'] as const) {
      const r = contrast(solid(colors.textFaint), SURFACES[name]);
      assert.ok(r >= 4.5, `textFaint on ${name}: ${r.toFixed(2)}`);
    }
  });

  it('body and secondary text on every tinted panel (callouts, choice cards, banners)', () => {
    for (const panel of ['primarySoft', 'rivalSoft', 'insightSoft', 'accentSoft', 'successSoft', 'dangerSoft'] as const) {
      for (const fg of ['text', 'textBody', 'textMuted'] as const) {
        const r = contrast(solid(colors[fg]), tint(panel));
        assert.ok(r >= 4.5, `${fg} on ${panel}: ${r.toFixed(2)}`);
      }
    }
  });

  it('each tone’s own text on its own tint', () => {
    const pairs = [
      ['primaryText', 'primarySoft'],
      ['rivalText', 'rivalSoft'],
      ['insight', 'insightSoft'],
      ['accent', 'accentSoft'],
      ['success', 'successSoft'],
      ['danger', 'dangerSoft'],
    ] as const;
    for (const [fg, panel] of pairs) {
      const r = contrast(solid(colors[fg]), tint(panel));
      assert.ok(r >= 4.5, `${fg} on ${panel}: ${r.toFixed(2)}`);
    }
  });

  it('button labels: the primary button and the destructive confirmation', () => {
    assert.ok(contrast(solid(colors.text), solid(colors.primary)) >= 4.5);
    assert.ok(contrast(solid(colors.text), solid(colors.primaryPressed)) >= 4.5);
    // Settings → Delete account confirmation (app/settings.tsx styles.dangerSolid).
    const settings = readFileSync(join(import.meta.dirname, '..', '..', '..', 'app', 'settings.tsx'), 'utf8');
    const solidBg = /dangerSolid: \{[^}]*backgroundColor: '(#[0-9A-Fa-f]{6})'/.exec(settings)![1];
    assert.ok(contrast([255, 255, 255], solid(solidBg)) >= 4.5);
  });

  it('text over the dialog scrim', () => {
    const scrim = over(colors.overlay, SURFACES.bg);
    for (const fg of ['text', 'textBody', 'textMuted'] as const) assert.ok(contrast(solid(colors[fg]), scrim) >= 4.5, fg);
  });
});

describe('large text, icons and state (3:1)', () => {
  it('icons in the tone colours are distinguishable on every surface', () => {
    for (const fg of ['primaryText', 'textMuted', 'rivalText', 'insight', 'accent', 'success', 'danger'] as const) {
      for (const [name, bg] of Object.entries(SURFACES)) assert.ok(contrast(solid(colors[fg]), bg) >= 3, `${fg} icon on ${name}`);
    }
  });

  it('the primary colour as a fill (selected states, the active tab) stands out from the page', () => {
    assert.ok(contrast(solid(colors.primary), SURFACES.bg) >= 3);
  });

  it('a switch’s white thumb stands out from both track colours', () => {
    assert.ok(contrast([255, 255, 255], solid(colors.primary)) >= 3);
    assert.ok(contrast([255, 255, 255], solid(colors.surfaceHigh)) >= 3);
  });
});
