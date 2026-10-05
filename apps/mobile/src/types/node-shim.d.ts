declare module 'fs' {
  export function statSync(target: string): { isFile(): boolean };
  export function readdirSync(target: string): string[];
  export function readFileSync(target: string, encoding: string): string;
  export function writeFileSync(target: string, data: string): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(target: string, options?: { recursive?: boolean; force?: boolean }): void;
}
declare module 'path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}
declare module 'os' {
  export function tmpdir(): string;
}
declare module 'child_process' {
  export function execFileSync(
    file: string,
    args: string[],
    options: { encoding: 'utf8' },
  ): string;
}
