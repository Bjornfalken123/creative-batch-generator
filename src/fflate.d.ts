declare module 'fflate' {
  export function unzipSync(data: Uint8Array): Record<string, Uint8Array>;
  export function zipSync(data: Record<string, Uint8Array>, options?: { level?: number }): Uint8Array;
  export function strFromU8(data: Uint8Array): string;
  export function strToU8(data: string): Uint8Array;
}
