import type { MetadataRoute } from "next";

// Приложение закрытое: вход по нику + ПИН, публичного контента для поиска нет,
// а страница входа со списком учеников в выдаче Google не нужна. Закрываем
// индексацию целиком. Если появится публичный лендинг — ослабить точечно.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
