import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec } from '@/lib/db/convert';
import { CLEANUP_MARKERS, isExact } from '@/lib/expenses/cleanup-shared';

// Разбор старых «расходов, заведённых платежом плюсом».
//
// До миграции 0009 расходов в системе не было, и сотрудники заводили трату
// обычным платежом, помечая её словом «витрати» в примечании или способе оплаты.
// Такой платёж завышал paid_total → фейковая переплата, заниженный долг и, самое
// важное, ЗАВЫШЕННАЯ зарплата (её база = paid_total).
//
// Здесь только ПОИСК кандидатов; конвертацию делает cleanup-actions.ts.

export type CleanupCandidate = {
  payment_id: string;
  case_id: string;
  case_number_title: string;
  amount: number;
  paid_at: string;
  method: string | null;
  note: string | null;
  /**
   * true — поле ЦЕЛИКОМ равно слову-маркеру («Витрати»), это точно трата.
   * false — маркер найден ВНУТРИ более длинного текста: может оказаться
   * настоящей оплатой с упоминанием расходов в комментарии. Такие показываем
   * отдельно и с предупреждением — на проде найден платёж на 70 000 ₴ с
   * примечанием «безготівка · витрати 10000», его конвертация уничтожила бы
   * реальную оплату.
   */
  exact: boolean;
};

// Слова-маркеры и isExact вынесены в cleanup-shared.ts (юнит-тестируются).
const MARKERS = CLEANUP_MARKERS;

export async function listCleanupCandidates(): Promise<CleanupCandidate[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.payments.findMany({
      where: {
        OR: MARKERS.flatMap((m) => [
          { note: { contains: m, mode: 'insensitive' as const } },
          { method: { contains: m, mode: 'insensitive' as const } },
        ]),
      },
      orderBy: [{ paid_at: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        case_id: true,
        amount: true,
        paid_at: true,
        method: true,
        note: true,
        cases: { select: { number_title: true } },
      },
    }),
  );

  return rows
    .map((p) => ({
      payment_id: p.id,
      case_id: p.case_id,
      case_number_title: p.cases?.number_title ?? '',
      amount: dec(p.amount),
      paid_at: dateOnly(p.paid_at),
      method: p.method,
      note: p.note,
      exact: isExact(p.note) || isExact(p.method),
    }))
    // Сомнительные — наверх: их нужно разобрать глазами, а не пролистать.
    .sort((a, b) => Number(a.exact) - Number(b.exact));
}
