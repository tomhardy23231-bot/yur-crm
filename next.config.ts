import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-сервер по локальной сети (2026-07-25): Next 16 блокирует внутренние
  // запросы /_next/* со «чужого» origin — с другого компьютера открывалась
  // только первая страница, переходы падали в «Сторінку не знайдено».
  // Список — только для dev; на прод (Vercel) не влияет.
  allowedDevOrigins: ['192.168.31.24', '192.168.137.1'],
};

export default nextConfig;
