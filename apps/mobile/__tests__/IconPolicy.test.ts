import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

declare const __dirname: string;

const roots = [resolve(__dirname, '../src'), resolve(__dirname, '../App.tsx')];

function filesIn(entry: string): string[] {
  if (statSync(entry).isFile()) return [entry];
  return readdirSync(entry).flatMap(name => filesIn(join(entry, name)));
}

const source = filesIn(roots[0])
  .concat(filesIn(roots[1]))
  .filter(file => /\.(tsx?|jsx?)$/.test(file));

function isPseudoIcon(code: number) {
  return (
    (code >= 0x1f000 && code <= 0x1faff) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    (code >= 0x2190 && code <= 0x21ff) ||
    (code >= 0x2300 && code <= 0x23ff) ||
    (code >= 0x25a0 && code <= 0x25ff) ||
    (code >= 0x2b00 && code <= 0x2bff) ||
    code === 0xfe0f ||
    code === 0x2630 ||
    (code >= 0x2713 && code <= 0x2718) ||
    code === 0xff0b
  );
}

test('mobile UI source has no emoji or unicode pseudo-icons', () => {
  const hits = source.flatMap(file => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines.flatMap((line, index) => {
      const codes = Array.from(line, char => char.codePointAt(0) || 0);
      return codes.some(isPseudoIcon)
        ? [`${relative(resolve(__dirname, '..'), file)}:${index + 1}:${line.trim()}`]
        : [];
    });
  });
  expect(hits).toEqual([]);
});
