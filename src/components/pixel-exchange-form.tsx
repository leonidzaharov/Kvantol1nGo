"use client";
import { useActionState } from "react";
import { recordPixelExchange } from "@/lib/actions/pixel-exchange";
import { pixelExchangeSummary } from "@/lib/pixel-economy";
export function PixelExchangeForm({ userId, requestId, coins, redeemed }: { userId: string; requestId: string; coins: number; redeemed: number }) {
  const [state, action, pending] = useActionState(recordPixelExchange, null);
  const summary = pixelExchangeSummary(coins, redeemed);
  return <form action={action} className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm">
    <input type="hidden" name="userId" value={userId} /><input type="hidden" name="requestId" value={requestId} />
    <p className="font-bold">Обмен: {coins} монет · выдано {redeemed} из 60 пикселей</p>
    <p className="my-2 text-neutral-500">20 монет = 1 пиксель. Сейчас доступно: {summary.available}. Записывайте здесь только фактически выданные вне сайта пиксели.</p>
    {summary.available > 0 && <fieldset disabled={pending || !!state?.success} className="flex flex-wrap items-center gap-3">
      <label>Пикселей <input type="number" name="pixels" min={1} max={summary.available} defaultValue={1} required className="ml-2 w-20 rounded-lg border-2 bg-white p-2" /></label>
      <label className="flex items-center gap-2"><input type="checkbox" name="confirmed" required /> Пиксели выданы вручную</label>
      <button type="submit" disabled={pending || !!state?.success} className="rounded-xl bg-green-600 px-3 py-2 font-bold text-white disabled:opacity-50">{pending ? "Сохраняем…" : "Зафиксировать и списать монеты"}</button>
    </fieldset>}
    <p role="status" className="mt-2">{state?.error ?? state?.success}</p>
  </form>;
}
