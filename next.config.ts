import type { NextConfig } from "next";

// Заголовки безопасности — применяются ко ВСЕМ ответам (source "/(.*)").
// Это «непробиваемый» набор: он не ломает работу сайта, но закрывает
// типовые атаки.
//
// Content-Security-Policy здесь больше НЕТ: строгий CSP с одноразовым
// nonce на каждый запрос выставляет src/proxy.ts (статическим заголовком
// nonce не сделать). Report-Only-фаза закончена.
const securityHeaders = [
  // Только HTTPS на 2 года вперёд (+ поддомены). Защита от downgrade/MITM.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Запрет встраивать сайт в чужой <iframe> — антикликджекинг.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Браузер не «угадывает» тип файла по содержимому — защита от подмены MIME.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Сколько реферера отдавать при переходах: свой origin целиком, чужим — только домен.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Глушим доступ к камере/микрофону/гео/Topics — сайту для детей это не нужно.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Разрешаем браузеру заранее резолвить DNS внешних ссылок — мелкий плюс к скорости.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // E2E может работать одновременно с обычным `npm run dev`: отдельный
  // distDir не даёт двум Next-процессам спорить за `.next/dev/lock`.
  distDir: process.env.KVANTOLINGO_E2E === "1" ? ".next-e2e" : ".next",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
