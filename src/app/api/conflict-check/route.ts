import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// POST /api/conflict-check  { name?, inn?, phone? } → { matches: {kind,label}[] }
// Конфликт-чек/дедуп при заведении клиента или указании оппонента (v3 Сессия 7).
// Авторизованный (requireUser); RPC conflict_check — SECURITY DEFINER (ищет по всей
// базе, возвращает только метаданные kind/label). Ничего не нашли по чему искать →
// пустой ответ без похода в БД. Дедупим по label (ветки 1/3 RPC могут совпасть).
export async function POST(req: Request) {
  await requireUser();

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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('conflict_check', {
    p_name: name || null,
    p_inn: inn || null,
    p_phone: phone || null,
  });
  if (error) {
    return NextResponse.json({ matches: [] });
  }

  const seen = new Set<string>();
  const matches: Array<{ kind: string; label: string }> = [];
  for (const m of (data ?? []) as Array<{ kind: string; label: string }>) {
    if (!m.label || seen.has(m.label)) continue;
    seen.add(m.label);
    matches.push({ kind: m.kind, label: m.label });
  }
  return NextResponse.json({ matches });
}
