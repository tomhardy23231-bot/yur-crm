import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { localProvider, verifyLocalSignedParams } from '@/lib/storage/local';

// Локальный storage-провайдер (цикл v4 с5): roundtrip, идемпотентность remove,
// подпись signedUrl (verify/подделка/срок), защита от path-traversal.
// local.ts читает env лениво (getRoot/hmacSecret — при вызове), поэтому env
// достаточно выставить в beforeAll.

const TMP = path.join(os.tmpdir(), `yur-storage-${process.pid}-${Date.now()}`);

beforeAll(() => {
  process.env.STORAGE_LOCAL_DIR = TMP;
  process.env.AUTH_SECRET = 'unit-test-secret-value-at-least-32-characters';
});

afterAll(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
});

function parse(url: string) {
  const q = new URL(url, 'http://x').searchParams;
  return {
    key: q.get('key') ?? '',
    exp: q.get('exp') ?? '',
    disp: q.get('disp') ?? '',
    name: q.get('name') ?? '',
    sig: q.get('sig') ?? '',
  };
}

describe('storage local provider', () => {
  it('upload → download возвращает те же байты', async () => {
    const key = 'cases/abc/def--file.pdf';
    const body = Buffer.from('hello pdf вміст');
    await localProvider.upload(key, body, { contentType: 'application/pdf' });
    const got = await localProvider.download(key);
    expect(got.equals(body)).toBe(true);
  });

  it('remove идемпотентен: повторное удаление не бросает, файл исчезает', async () => {
    const key = 'cases/abc/rm--x.txt';
    await localProvider.upload(key, Buffer.from('x'));
    await localProvider.remove(key);
    await expect(localProvider.remove(key)).resolves.toBeUndefined();
    await expect(localProvider.download(key)).rejects.toThrow();
  });

  it('signedUrl(download) — валидная подпись, disp=a, имя сохранено (юникод)', async () => {
    const url = await localProvider.signedUrl('cases/x/y--a.pdf', {
      download: 'акт-№1.pdf',
    });
    expect(url.startsWith('/api/storage/local?')).toBe(true);
    const p = parse(url);
    expect(p.disp).toBe('a');
    expect(p.name).toBe('акт-№1.pdf');
    expect(verifyLocalSignedParams(p)).toBe(true);
  });

  it('signedUrl(preview) — disp=i, имя пустое, подпись валидна', async () => {
    const p = parse(await localProvider.signedUrl('cases/x/y--a.pdf'));
    expect(p.disp).toBe('i');
    expect(p.name).toBe('');
    expect(verifyLocalSignedParams(p)).toBe(true);
  });

  it('подделка любого параметра инвалидирует подпись', async () => {
    const p = parse(await localProvider.signedUrl('cases/x/y--a.pdf', { download: 'a.pdf' }));
    expect(verifyLocalSignedParams({ ...p, sig: 'tampered' })).toBe(false);
    expect(verifyLocalSignedParams({ ...p, key: 'cases/other/z--b.pdf' })).toBe(false);
    expect(verifyLocalSignedParams({ ...p, disp: 'i' })).toBe(false);
    expect(verifyLocalSignedParams({ ...p, name: 'other.pdf' })).toBe(false);
  });

  it('протухшая ссылка отклоняется даже с валидной подписью', async () => {
    const p = parse(await localProvider.signedUrl('cases/x/y--a.pdf', { expiresIn: -10 }));
    expect(verifyLocalSignedParams(p)).toBe(false);
  });

  it('path traversal в ключе запрещён', async () => {
    await expect(
      localProvider.upload('../evil', Buffer.from('x')),
    ).rejects.toThrow(/traversal|недопустим/i);
    await expect(
      localProvider.download('../../etc/passwd'),
    ).rejects.toThrow(/traversal|недопустим/i);
  });
});
