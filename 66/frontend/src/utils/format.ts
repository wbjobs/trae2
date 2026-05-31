export function getImageUrl(fileName: string | null | undefined): string {
  if (!fileName) return '';
  if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
    return fileName;
  }
  return `/uploads/${fileName}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatCoordinate(coord: number | null | undefined, type: 'lat' | 'lng'): string {
  if (coord === null || coord === undefined) return '-';
  const direction = type === 'lat' 
    ? (coord >= 0 ? 'N' : 'S') 
    : (coord >= 0 ? 'E' : 'W');
  return `${Math.abs(coord).toFixed(4)}° ${direction}`;
}

export function truncateText(text: string | null | undefined, maxLength: number = 50): string {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
