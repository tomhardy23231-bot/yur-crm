// Утилиты, общие для storage-провайдеров (цикл v4, сессия 5).
// Чистые функции (mime по расширению, Content-Disposition) — используются и
// сервером, и скриптом переноса; server-only-маркер здесь не нужен.

// MIME по расширению — нужен ЛОКАЛЬНОМУ провайдеру, который (в отличие от
// S3/R2) не хранит content-type объекта. Для inline-превью браузеру важен
// корректный тип; список покрывает «нативно превьюшные» форматы
// (isNativePreview: картинки/pdf/текст) + office на всякий случай.
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function guessContentType(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

// Content-Disposition с поддержкой не-ASCII имён (кириллица/укр).
// RFC 6266 + RFC 5987: ASCII-фолбэк в filename="" + точное имя в filename*.
export function contentDisposition(
  mode: 'attachment' | 'inline',
  filename?: string,
): string {
  if (!filename) return mode;
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
