import 'server-only';

import { fileExt, ooDocumentType, ooEditable } from '@/lib/documents/preview';
import { signHs256 } from './jwt';

// Чтение ENV OnlyOffice в одном месте.
//  - browserUrl: URL Document Server, который грузит БРАУЗЕР (api.js).
//  - secret: общий JWT-секрет (подпись конфига + проверка callback).
//  - appUrlForDs: как НАШ app достижим ИЗ контейнера DS (для document.url и
//    callbackUrl). Локально в Docker это http://host.docker.internal:3000.
//  - internalUrl: как app достучится до DS на сервере (скачать сохранённый
//    файл в callback). Локально с хоста — обычно тот же, что browserUrl.
export function onlyOfficeEnv() {
  return {
    browserUrl: process.env.NEXT_PUBLIC_ONLYOFFICE_URL ?? '',
    secret: process.env.ONLYOFFICE_JWT_SECRET ?? '',
    appUrlForDs: process.env.APP_URL_FOR_ONLYOFFICE ?? '',
    internalUrl:
      process.env.ONLYOFFICE_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_ONLYOFFICE_URL ??
      '',
  };
}

export function onlyOfficeConfigured(): boolean {
  const e = onlyOfficeEnv();
  return Boolean(e.browserUrl && e.secret && e.appUrlForDs);
}

export interface BuildConfigInput {
  doc: {
    id: string;
    file_name: string;
    uploaded_at: string;
    updated_at?: string | null;
  };
  /** Может ли пользователь МЕНЯТЬ дело (RLS write). Иначе — режим просмотра. */
  canWrite: boolean;
  user: { id: string; name: string };
  /** Язык интерфейса редактора (uk/ru). */
  lang: string;
}

// Собрать и подписать конфиг редактора OnlyOffice.
export function buildEditorConfig(input: BuildConfigInput) {
  const { doc, canWrite, user, lang } = input;
  const env = onlyOfficeEnv();
  const ext = fileExt(doc.file_name);
  const documentType = ooDocumentType(ext) ?? 'word';
  const editable = canWrite && ooEditable(ext);

  // Ключ версии: меняется при сохранении (по updated_at). ≤128 симв, [0-9A-Za-z_-].
  const stamp = doc.updated_at ?? doc.uploaded_at;
  const key = `${doc.id.replace(/-/g, '')}_${Date.parse(stamp) || 0}`;

  // Краткоживущий токен, авторизующий скачивание файла сервером DS (10 мин).
  const contentToken = signHs256(
    { doc_id: doc.id, exp: Math.floor(Date.now() / 1000) + 600 },
    env.secret,
  );

  const config: Record<string, unknown> = {
    documentType,
    document: {
      fileType: ext,
      key,
      title: doc.file_name,
      url: `${env.appUrlForDs}/api/documents/${doc.id}/content?token=${encodeURIComponent(
        contentToken,
      )}`,
      permissions: {
        edit: editable,
        download: true,
        print: true,
      },
    },
    editorConfig: {
      mode: editable ? 'edit' : 'view',
      lang,
      callbackUrl: `${env.appUrlForDs}/api/documents/${doc.id}/oo-callback`,
      user: { id: user.id, name: user.name },
      customization: {
        autosave: true,
        forcesave: true,
        chat: false,
        comments: editable,
        help: false,
      },
    },
  };

  // Подпись всего конфига (без поля token) — DS сверит её.
  (config as { token?: string }).token = signHs256(config, env.secret);

  return { config, browserUrl: env.browserUrl };
}
