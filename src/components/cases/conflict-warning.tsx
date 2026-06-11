'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// Конфликт-чек / дедуп (v3 Сессия 7). Хук дёргает POST /api/conflict-check на blur
// полей формы (имя/ИНН/телефон или оппонент), отменяя предыдущий запрос. Блок
// ConflictWarning рендерит найденные совпадения над кнопкой сабмита. НЕ блокирует.

export type ConflictParams = { name?: string; inn?: string; phone?: string };

export function useConflictCheck() {
  const [matches, setMatches] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback((params: ConflictParams) => {
    const name = (params.name ?? '').trim();
    const inn = (params.inn ?? '').trim();
    const phone = (params.phone ?? '').trim();

    // Нечего искать → очищаем (не дёргаем сеть).
    if (name.length < 5 && !inn && !phone) {
      setMatches([]);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch('/api/conflict-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, inn, phone }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((d: { matches?: Array<{ label: string }> }) => {
        setMatches((d.matches ?? []).map((m) => m.label).filter(Boolean));
      })
      .catch(() => {
        /* abort / нет сети — конфликт-чек необязателен, молчим */
      });
  }, []);

  return { matches, check };
}

export function ConflictWarning({
  matches,
  message,
}: {
  matches: string[];
  message: string;
}) {
  if (matches.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12.5px] text-warning"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
        {message}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {matches.map((m, i) => (
          <li key={`${m}-${i}`}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
