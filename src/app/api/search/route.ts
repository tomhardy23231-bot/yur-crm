import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import { searchEverything } from '@/lib/search/queries';
import { EMPTY_RESULTS } from '@/lib/search/types';

// GET /api/search?q=<query>
// Глобальный поиск для Cmd+K палитры. Авторизованный (requireUser),
// RLS отрежет невидимое в каждой из 3 параллельных подзапросах.
//
// Пустой / коротенький q (< 2 символов) возвращает пустой результат сразу,
// чтобы не давить БД на «s» или «к».
export async function GET(req: Request) {
  await requireUser();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json(EMPTY_RESULTS);
  }

  const results = await searchEverything(q);
  return NextResponse.json(results);
}
