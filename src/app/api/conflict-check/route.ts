import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import { userDb } from '@/lib/db';
import { rpcConflictCheck } from '@/lib/db/rpc';

// POST /api/conflict-check  { name?, inn?, phone? } → { matches: {kind,label}[] }
// Конфликт-чек/дедуп при заведении клиента или указании оппонента (v3 Сессия 7).
// Авторизованный (requireUser); RPC conflict_check — SECURITY DEFINER (ищет по всей
// базе, возвращает только метаданные kind/label). Ничего не нашли по чему искать →
// пустой ответ без похода в БД. Дедупим по label (ветки 1/3 RPC могут совпасть).
export async function POST(req: Request) {
  const user = await requireUser();

  let body: { name?: unknown; inn?: unknown; phone?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ matches: [] });
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const name = str(body.name);
  const inn = str(body.inn);
  const phone = str(body.phone);

  // Имя короче 5 символов RPC по name не матчит; без inn/phone искать не по чему.
  if (name.length < 5 && !inn && !phone) {
    return NextResponse.json({ matches: [] });
  }

  let rows: Array<{ kind: string; label: string }>;
  try {
    rows = await userDb(user.profile.id, (tx) =>
      rpcConflictCheck(tx, {
        name: name || null,
        inn: inn || null,
        phone: phone || null,
      }),
    );
  } catch {
    return NextResponse.json({ matches: [] });
  }

  const seen = new Set<string>();
  const matches: Array<{ kind: string; label: string }> = [];
  for (const m of rows) {
    if (!m.label || seen.has(m.label)) continue;
    seen.add(m.label);
    matches.push({ kind: m.kind, label: m.label });
  }
  return NextResponse.json({ matches });
}
