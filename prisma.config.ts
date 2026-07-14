// Конфиг Prisma CLI (Prisma 7): подключение для introspect/CLI-команд.
// Runtime-подключения приложения задаются driver-адаптерами в src/lib/db/*
// и этот файл НЕ используют.
//
// ⚠ Prisma 7 сам .env-файлы НЕ читает — переменную передаём при вызове:
//   DATABASE_URL_ADMIN_DIRECT=... npx prisma db pull
// (пере-introspect запрещён правилом в schema.prisma — только первичный).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL_ADMIN_DIRECT ?? '',
  },
});
