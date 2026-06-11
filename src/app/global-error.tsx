'use client';

import { useEffect } from 'react';

// Глобальная error-граница (Сессия 5). Срабатывает, когда падает САМ корневой
// layout — поэтому ОБЯЗАНА рендерить собственные <html>/<body> (требование Next)
// и не может полагаться на globals.css/токены/провайдер i18n. Отсюда инлайн-стили
// и двуязычный статичный текст (cookie/словари здесь могут быть недоступны).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#F1F5F9',
          color: '#0F172A',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            textAlign: 'center',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 16,
            padding: '40px 32px',
            boxShadow: '0 8px 32px -12px rgba(15,23,42,0.18)',
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
            Щось пішло не так / Что-то пошло не так
          </h1>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: '#64748B',
              margin: '0 0 20px',
            }}
          >
            Сталася критична помилка. Спробуйте оновити сторінку.
            <br />
            Произошла критическая ошибка. Попробуйте обновить страницу.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: 'pointer',
              border: 'none',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 14,
              fontWeight: 600,
              color: '#FFFFFF',
              background: '#2563EB',
            }}
          >
            Спробувати ще раз / Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
