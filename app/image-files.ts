export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PASTE_IMAGES = 4;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export function imageId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function nativeImagePath(value: string) {
  return value.startsWith('/api/images/') && imageId(value.slice('/api/images/'.length));
}
export function rasterImageType(bytes: Uint8Array): string | null {
  const prefix = (values: number[]) => values.every((value, index) => bytes[index] === value);
  if (prefix([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (prefix([255, 216, 255])) return 'image/jpeg';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export function clipboardImages(data: DataTransfer): File[] {
  const files = Array.from(data.items || [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile()).filter((file): file is File => !!file);
  return files.length ? files : Array.from(data.files || []).filter(file => file.type.startsWith('image/'));
}
