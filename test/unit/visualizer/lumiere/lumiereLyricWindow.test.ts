import { describe, expect, it, vi } from 'vitest';
import type { Line } from '@/types';
import { LUMIERE_PROFILES } from '@/components/visualizer/lumiere/catalog';
import type { LightSprites } from '@/components/visualizer/lumiere/light/sprites';
import { resolveLumierePalette } from '@/components/visualizer/lumiere/scene';
import { createLyricWindow, type WindowTypography } from '@/components/visualizer/lumiere/text/lyricWindow';

// test/unit/visualizer/lumiere/lumiereLyricWindow.test.ts
// 歌词窗口的排版：当前行（含逐词字号差异、长句）缩放后落在光位的文字区里，位置只由时刻决定；
// 以及绘光的调色（暗场底只在浅色背景时出现）。用假的 Pixi 与假的字形条跑纯布局，不碰 canvas / WebGL。
vi.mock('@/components/visualizer/lumiere/text/glyphLine', async importOriginal => {
    const actual = await importOriginal<typeof import('@/components/visualizer/lumiere/text/glyphLine')>();
    return {
        ...actual,
        // 字形条：中日文一个字宽一个字号，拉丁字母 0.55 个字号，空格 0.3 个字号。
        buildGlyphLine: (_pixi: unknown, options: { text: string; fontPx: number; letterSpacing?: number }) => {
            const chars = Array.from(options.text);
            let x = 0;
            const glyphs = chars.map(char => {
                const upright = actual.isUprightGlyph(char);
                const width = options.fontPx * (char.trim() === '' ? 0.3 : upright ? 1 : 0.55) + options.fontPx * (options.letterSpacing ?? 0);
                const slice = { char, x, width, charX: x, charWidth: width, anchorX: 0.5, anchorY: 0.5, texture: {}, blank: char.trim() === '', upright };
                x += width;
                return slice;
            });
            return { text: options.text, fontPx: options.fontPx, width: x, height: options.fontPx * 1.5, glyphs, destroy: () => undefined };
        },
    };
});

/** 只实现歌词窗口用到的那一点 Pixi：容器树、精灵属性、Graphics 的链式画线。 */
class FakeContainer {
    children: unknown[] = [];
    visible = true;
    alpha = 1;
    rotation = 0;
    tint = 0xffffff;
    width = 0;
    height = 0;
    position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
    scale = { x: 1, y: 1, set: (x: number, y = x) => { this.scale.x = x; this.scale.y = y; } };
    anchor = { set: () => undefined };
    addChild(...items: unknown[]) { this.children.push(...items); return items[0]; }
    destroy() { this.children = []; }
}
class FakeSprite extends FakeContainer {
    constructor(public texture?: unknown) { super(); }
}
class FakeGraphics extends FakeContainer {
    clear() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    stroke() { return this; }
}
const pixi = { Container: FakeContainer, Sprite: FakeSprite, Graphics: FakeGraphics } as unknown as typeof import('pixi.js');
const sprites = { dot: {}, star: {}, bokeh: {}, streak: {}, destroy: () => undefined } as unknown as LightSprites;

const WIDTH = 1600;
const HEIGHT = 900;
const aspect = WIDTH / HEIGHT;

/** 逐字时间：每个字 0.25 秒，一行一个词。 */
const line = (fullText: string, startTime: number): Line => {
    const chars = Array.from(fullText);
    return {
        fullText,
        startTime,
        endTime: startTime + chars.length * 0.25,
        words: chars.map((text, index) => ({ text, startTime: startTime + index * 0.25, endTime: startTime + (index + 1) * 0.25 })),
    };
};

const LINES = [
    line('光落在晨雾里', 2),
    line('我们慢慢走回去，星河与风一起落在很远很远的地方', 6),
    line('light falls through the haze again', 14),
    line('回去', 20),
    line('我把名字写进晨雾里', 24),
];

const buildWindow = (profileIndex: number, typography: WindowTypography) => {
    const profile = LUMIERE_PROFILES[profileIndex]!;
    const region = { cx: profile.region.cx * aspect, cy: profile.region.cy, w: profile.region.w * aspect, h: profile.region.h };
    const heroPx = profile.heroSize * HEIGHT;
    const window = createLyricWindow(pixi, {
        width: WIDTH,
        height: HEIGHT,
        lines: LINES,
        font: 'sans-serif',
        weight: 500,
        resolution: 1,
        region,
        heroPx,
        neighbors: 2,
        typography,
        decay: { strength: 1, delay: 1 },
        seed: `window:${profile.kind}`,
        sprites,
        letterSpacing: 0.04,
    });
    return { window, region, heroPx };
};

/** 某行所有可见字的包围盒（像素，字心 ± 半个字号）。 */
const lineBox = (window: ReturnType<typeof buildWindow>['window'], lineIndex: number, time: number) => {
    const glyphs = window.glyphTimes(lineIndex).map(({ glyphIndex }) => window.glyphAnchor(lineIndex, glyphIndex, time));
    return {
        left: Math.min(...glyphs.map(g => g.x - g.fontPx / 2)),
        right: Math.max(...glyphs.map(g => g.x + g.fontPx / 2)),
        top: Math.min(...glyphs.map(g => g.y - g.fontPx / 2)),
        bottom: Math.max(...glyphs.map(g => g.y + g.fontPx / 2)),
    };
};

describe('歌词窗口的排版', () => {
    // 每族挑第一个光位（文字区各不相同）。
    const profiles = LUMIERE_PROFILES.map((profile, index) => [profile.kind, index] as const).filter((_, index) => index % 10 === 0);

    it.each(profiles)('%s：当前行（含长句）缩放后落在文字区里', (_kind, profileIndex) => {
        for (const typography of ['horizontal', 'vertical', 'crossed'] as const) {
            const { window, region, heroPx } = buildWindow(profileIndex, typography);
            LINES.forEach((item, lineIndex) => {
                // 换行滑动结束之后、字开始崩解之前。
                const time = item.startTime + 0.7;
                const box = lineBox(window, lineIndex, time);
                // 漂移、绕行、呼吸与转动留一点余量。
                const margin = 0.06 * HEIGHT + heroPx * 0.35;
                expect(box.left, `${typography} ${lineIndex}`).toBeGreaterThanOrEqual((region.cx - region.w / 2) * HEIGHT - margin);
                expect(box.right, `${typography} ${lineIndex}`).toBeLessThanOrEqual((region.cx + region.w / 2) * HEIGHT + margin);
                expect(box.top, `${typography} ${lineIndex}`).toBeGreaterThanOrEqual((region.cy - region.h / 2) * HEIGHT - margin);
                expect(box.bottom, `${typography} ${lineIndex}`).toBeLessThanOrEqual((region.cy + region.h / 2) * HEIGHT + margin);
            });
            window.destroy();
        }
    });

    it('位置只由时刻决定（与之前查过哪些时刻无关）', () => {
        const { window } = buildWindow(0, 'crossed');
        const probe = () => [1, 2, 3].map(index => window.lineAnchor(index, 15.3));
        const first = probe();
        [0, 30, 7.7, 2].forEach(time => window.lineAnchor(2, time));
        expect(probe()).toEqual(first);
    });
});

describe('绘光的调色', () => {
    const theme = (backgroundColor: string) => ({ backgroundColor, accentColor: '#88aaff' }) as Parameters<typeof resolveLumierePalette>[0];

    it('深色背景不铺暗场底，浅色背景铺一层压暗的暗场底', () => {
        expect(resolveLumierePalette(theme('#0b0d12')).dark[3]).toBe(0);
        const bright = resolveLumierePalette(theme('#f4efe6'));
        expect(bright.dark[3]).toBeCloseTo(0.94);
        // 预乘：颜色不超过 alpha。
        bright.dark.slice(0, 3).forEach(channel => expect(channel).toBeLessThanOrEqual(bright.dark[3]));
    });

    it('光色最亮的通道归一到 1，未点亮色比点亮色暗', () => {
        const palette = resolveLumierePalette(theme('#000000'));
        expect(Math.max(...palette.light)).toBeCloseTo(1);
        const sum = (rgb: number[]) => rgb.reduce((a, b) => a + b, 0);
        expect(sum(palette.unlit)).toBeLessThan(sum(palette.lit));
    });
});
