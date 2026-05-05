// src/types/expo-file-system.d.ts
declare module 'expo-file-system/legacy' {
  export function readAsStringAsync(fileUri: string, options?: { encoding?: string }): Promise<string>;
  export function writeAsStringAsync(fileUri: string, contents: string): Promise<void>;
  export function deleteAsync(fileUri: string): Promise<void>;
  export function getInfoAsync(fileUri: string): Promise<{ exists: boolean; size?: number }>;
  export function makeDirectoryAsync(fileUri: string): Promise<void>;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;
  export function moveAsync(options: { from: string; to: string }): Promise<void>;
  export const documentDirectory: string;
  export const cacheDirectory: string;

  export const EncodingType: {
    UTF8: string;
    Base64: string;
  };
}