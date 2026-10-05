declare module 'fs' {
  export function statSync(target: string): { isFile(): boolean };
  export function readdirSync(target: string): string[];
  export function readFileSync(target: string, encoding: string): string;
}
declare module 'path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}
