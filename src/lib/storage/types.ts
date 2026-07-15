// Интерфейс файлохранилища (цикл v4, сессия 5) — 4 операции, план §4.4.
//
// ЕДИНСТВЕННАЯ абстракция над хранилищем файлов по делам.
// Реализации (S3-совместимая для R2/MinIO, локальная файловая для
// dev/тестов) выбираются в ./index по STORAGE_PROVIDER — вызывающий код их
// не различает. Смена R2 → MinIO/диск на корп-сервере = смена env, без правки
// вызовов (CLAUDE.md §1.4, без vendor lock-in).
//
// Convention storage_key сохраняется как есть: `cases/<case_id>/<uuid>--<slug>`
// (в БД documents.storage_key ничего менять не надо).

export type SignedUrlOptions = {
  /**
   * Имя файла для Content-Disposition: attachment (браузер СКАЧИВАЕТ файл под
   * оригинальным именем из БД). Без него — inline (браузер открывает в
   * iframe/img: превью картинок/pdf/текста).
   */
  download?: string;
  /** TTL ссылки в секундах. По умолчанию 600 (10 мин). */
  expiresIn?: number;
};

export interface StorageProvider {
  /**
   * Записать объект. Перезапись существующего ключа разрешена (oo-callback
   * намеренно перезаписывает сохранённый из OnlyOffice файл); для новых
   * загрузок коллизия исключена уникальным UUID в ключе.
   */
  upload(
    key: string,
    body: Buffer,
    opts?: { contentType?: string },
  ): Promise<void>;

  /** Скачать объект целиком (OnlyOffice content-роут отдаёт его DS). */
  download(key: string): Promise<Buffer>;

  /**
   * Краткоживущая ссылка на объект. Для S3/R2 — presigned URL прямо в облако
   * (браузер идёт туда, минуя наш сервер). Для локального
   * провайдера — URL нашего стрим-роута с HMAC-подписью (см. ./local).
   */
  signedUrl(key: string, opts?: SignedUrlOptions): Promise<string>;

  /** Удалить объект. Идемпотентно: отсутствующий ключ — не ошибка. */
  remove(key: string): Promise<void>;
}
