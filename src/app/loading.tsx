import { Loader } from "lucide-react";

// Показывается, пока серверная страница ждёт данные (уроки, лидерборд и т.п.).
// Простой центрированный лоадер вместо «замершего» пустого экрана.
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader className="h-8 w-8 animate-spin text-green-500" />
    </div>
  );
}
