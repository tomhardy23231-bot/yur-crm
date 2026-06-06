// Определение «как показывать файл» по расширению имени. Без server-only —
// используется и на клиенте (строка документа, модалка просмотра), и на сервере
// (preview-роут, конфиг OnlyOffice). Тип в БД не храним — расширения достаточно.

export type PreviewKind = 'image' | 'pdf' | 'text' | 'office' | 'other';

const IMAGE_EXT = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif',
]);
const TEXT_EXT = new Set([
  'txt', 'csv', 'md', 'log', 'json', 'xml', 'yml', 'yaml',
]);
// Форматы, которые умеет открывать/редактировать OnlyOffice Document Server.
const OFFICE_EXT = new Set([
  'doc', 'docx', 'odt', 'rtf',
  'xls', 'xlsx', 'ods',
  'ppt', 'pptx', 'odp',
]);

export function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

export function previewKind(fileName: string): PreviewKind {
  const ext = fileExt(fileName);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXT.has(ext)) return 'text';
  if (OFFICE_EXT.has(ext)) return 'office';
  return 'other';
}

// Часть 1: что показываем нативно браузером, без OnlyOffice.
export function isNativePreview(kind: PreviewKind): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'text';
}

// Есть ли вообще встроенный просмотр (нативный или через OnlyOffice).
export function isPreviewable(kind: PreviewKind): boolean {
  return kind !== 'other';
}

// ── OnlyOffice helpers (Часть 2) ─────────────────────────────────────
// Тип документа для редактора OnlyOffice.
export type OoDocumentType = 'word' | 'cell' | 'slide';

export function ooDocumentType(ext: string): OoDocumentType | null {
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'cell';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slide';
  return null;
}

// Какие форматы OnlyOffice умеет именно РЕДАКТИРОВАТЬ (а не только смотреть).
export function ooEditable(ext: string): boolean {
  return ['docx', 'xlsx', 'pptx'].includes(ext);
}
