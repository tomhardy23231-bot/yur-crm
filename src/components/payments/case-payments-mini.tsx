import { listPaymentsByCase } from '@/lib/payments/queries';

import { PaymentsList } from './payments-list';

interface Props {
  caseId: string;
  /** Может ли добавлять платёж (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Может ли удалять платёж (RLS DELETE = staff). */
  canManage: boolean;
  /** Переплата клиента (max(0, paid_total − contract_sum)). Показываем, если > 0. */
  overpaid?: number;
}

// Компактный список платежей по делу — для колонки «Оплата и суд» в шапке.
// Серверный компонент только грузит данные; список + итог + добавление с
// оптимистичным UI вынесены в клиентский PaymentsList (useOptimistic). Экшены
// делают revalidatePath, поэтому плитки сумм и «Вознаграждение команды»
// обновляются сами.
export async function CasePaymentsMini({
  caseId,
  canWrite,
  canManage,
  overpaid = 0,
}: Props) {
  const payments = await listPaymentsByCase(caseId);

  return (
    <PaymentsList
      payments={payments}
      caseId={caseId}
      canWrite={canWrite}
      canManage={canManage}
      overpaid={overpaid}
    />
  );
}
