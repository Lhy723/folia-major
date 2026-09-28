import type { Line, Word } from '@/types';
import { createRng } from '@/components/visualizer/lumiere/lumiereRandom';

// test/unit/visualizer/lumiere/lumiereFixtures.ts
// 绘光单测共用的合成歌词：7 段、主歌 / 副歌交替、中日文与拉丁词混排、段间有长短不一的间隙（取自 lumisynth 的 syntheticSong）。
const LATIN = ['light', 'falls', 'through', 'the', 'haze', 'we', 'drift', 'again', 'slowly', 'home'];
const CJK = Array.from('光落在晨雾里我们慢慢走回去星河与风');

export const syntheticSong = (seed: number, wordByWord = true): Line[] => {
    const random = createRng(seed);
    const lines: Line[] = [];
    let time = 2 + random() * 4;
    for (let p = 0; p < 7; p += 1) {
        const count = 2 + Math.floor(random() * 7);
        const part = p % 3 === 2 ? 'Chorus' : 'Verse';
        for (let i = 0; i < count; i += 1) {
            const latin = random() < 0.35;
            const words: Word[] = [];
            let cursor = time;
            const wordCount = 2 + Math.floor(random() * 6);
            for (let w = 0; w < wordCount; w += 1) {
                const text = latin
                    ? `${LATIN[Math.floor(random() * LATIN.length)]}${w < wordCount - 1 ? ' ' : ''}`
                    : Array.from({ length: 1 + Math.floor(random() * 3) }, () => CJK[Math.floor(random() * CJK.length)]).join('');
                const duration = 0.15 + random() * 0.6;
                words.push({ text, startTime: cursor, endTime: cursor + duration });
                cursor += duration;
            }
            if (random() < 0.25) words[words.length - 1]!.text += latin ? '!' : '、';
            const fullText = words.map(word => word.text).join('');
            lines.push({
                words: wordByWord ? words : [{ text: fullText, startTime: time, endTime: cursor }],
                startTime: time,
                endTime: cursor,
                fullText,
                songPart: part,
            });
            time = cursor + 0.05 + random() * 0.5;
        }
        time += 1 + random() * 7;
    }
    return lines;
};
