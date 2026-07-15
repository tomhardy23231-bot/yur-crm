// Пустышка для alias `server-only` в unit-конфиге (vitest.config.ts).
// `server-only` — маркер-пакет: его index.js бросает вне серверного бандла, что
// в дефолтном unit-пуле роняет импорт любого серверного модуля (lib/storage,
// lib/db…). В юнит-тестах маркер не нужен — подменяем на no-op. Integration-пул
// (forks) резолвит его сам через react-server-условие, ему alias не требуется.
export {};
