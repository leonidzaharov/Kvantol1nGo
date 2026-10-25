"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { connectMatchingPair, shuffleMatchingCards } from "@/lib/matching-pairs";
import type { MatchingCard, MatchingPair } from "@/lib/practice-types";
import { cn } from "@/lib/utils";

type Side = "left" | "right";
type Pick = { side: Side; id: string };
type Point = { x: number; y: number };
type Drag = Pick & { pointerId: number; startX: number; startY: number; moved: boolean };
type Props = {
  left: MatchingCard[];
  right: MatchingCard[];
  pairs: MatchingPair[];
  onChange: (pairs: MatchingPair[]) => void;
  shuffleSeed: string;
  disabled?: boolean;
  correctPairs?: MatchingPair[];
};

function curve(from: Point, to: Point): string {
  const bend = Math.max(16, Math.abs(to.x - from.x) / 2);
  return `M${from.x},${from.y} C${from.x + bend},${from.y} ${to.x - bend},${to.y} ${to.x},${to.y}`;
}

export function MatchingQuestion({ left, right, pairs, onChange, shuffleSeed, disabled = false, correctPairs }: Props) {
  const [columns] = useState(() => ({
    left: shuffleMatchingCards(left, `${shuffleSeed}:left`),
    right: shuffleMatchingCards(right, `${shuffleSeed}:right`),
  }));
  const [selected, setSelected] = useState<Pick | null>(null);
  const [points, setPoints] = useState<Record<string, Point>>({});
  const board = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const rubber = useRef<SVGPathElement>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    let measurement: number | null = null;
    const measure = () => {
      measurement = null;
      const bounds = board.current?.getBoundingClientRect();
      if (!bounds) return;
      const next: Record<string, Point> = {};
      cards.current.forEach((card, key) => {
        const rect = card.getBoundingClientRect();
        next[key] = {
          x: (key.startsWith("left:") ? rect.right : rect.left) - bounds.left,
          y: rect.top + rect.height / 2 - bounds.top,
        };
      });
      setPoints((old) => Object.keys(next).every((key) => old[key]?.x === next[key].x && old[key]?.y === next[key].y) ? old : next);
    };
    const schedule = () => {
      if (measurement === null) measurement = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    if (board.current) observer.observe(board.current);
    cards.current.forEach((card) => observer.observe(card));
    schedule();
    return () => {
      observer.disconnect();
      if (measurement !== null) cancelAnimationFrame(measurement);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  function connect(first: Pick, second: Pick) {
    if (first.side === second.side || disabled) return;
    const l = first.side === "left" ? first.id : second.id;
    const r = first.side === "right" ? first.id : second.id;
    onChange(connectMatchingPair(pairs, l, r));
    setSelected(null);
  }

  function pick(side: Side, id: string) {
    if (disabled) return;
    if (selected && selected.side !== side) {
      connect(selected, { side, id });
    } else if (selected?.side === side && selected.id === id) {
      setSelected(null);
    } else {
      const link = pairs.find((pair) => side === "left" ? pair.leftId === id : pair.rightId === id);
      if (link) {
        onChange(pairs.filter((pair) => pair !== link));
        setSelected(null);
      } else {
        setSelected({ side, id });
      }
    }
  }

  function stopDrag() {
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    rubber.current?.setAttribute("d", "");
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || disabled) return;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 6 && !active.moved) return;
    active.moved = true;
    const { clientX, clientY } = event;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const bounds = board.current?.getBoundingClientRect();
      const start = points[`${active.side}:${active.id}`];
      if (!bounds || !start) return;
      const end = { x: clientX - bounds.left, y: clientY - bounds.top };
      rubber.current?.setAttribute("d", active.side === "left" ? curve(start, end) : curve(end, start));
    });
  }

  function pointerEnd(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.moved) {
      suppressClick.current = true;
      if (!cancelled && !disabled) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>("[data-matching-card]");
        const side = target?.dataset.side as Side | undefined;
        const id = target?.dataset.cardId;
        if (target && board.current?.contains(target) && side && id) connect(active, { side, id });
      }
    }
    stopDrag();
  }

  function line(pair: MatchingPair, solution = false) {
    const from = points[`left:${pair.leftId}`];
    const to = points[`right:${pair.rightId}`];
    if (!from || !to) return null;
    const wrong = correctPairs && !correctPairs.some((correct) => correct.leftId === pair.leftId && correct.rightId === pair.rightId);
    return <path key={`${solution ? "solution" : "answer"}:${pair.leftId}`} d={curve(from, to)} fill="none" stroke="currentColor" strokeWidth={3}
      strokeDasharray={!solution && wrong ? "5 4" : undefined}
      className={solution || (correctPairs && !wrong) ? "text-green-600" : wrong ? "text-rose-500" : "text-sky-500"} />;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-600">Выбери карточку в одной колонке, затем в другой. Повторный выбор связанной карточки убирает связь.</p>
      <div ref={board} className="relative grid grid-cols-2 items-start gap-x-10 sm:gap-x-20">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {pairs.map((pair) => line(pair))}
          {correctPairs?.filter((pair) => !pairs.some((answer) => answer.leftId === pair.leftId && answer.rightId === pair.rightId)).map((pair) => line(pair, true))}
          <path ref={rubber} fill="none" stroke="currentColor" strokeWidth={3} strokeDasharray="4 4" className="text-sky-500" />
        </svg>
        {(["left", "right"] as const).map((side) => (
          <div key={side} role="group" aria-label={side === "left" ? "Левая колонка" : "Правая колонка"} className="relative flex min-w-0 flex-col gap-3">
            {columns[side].map((card) => {
              const link = pairs.find((pair) => side === "left" ? pair.leftId === card.id : pair.rightId === card.id);
              const number = link ? columns.left.findIndex((item) => item.id === link.leftId) + 1 : null;
              const targetId = link && (side === "left" ? link.rightId : link.leftId);
              const target = columns[side === "left" ? "right" : "left"].find((item) => item.id === targetId);
              const active = selected?.side === side && selected.id === card.id;
              return (
                <button key={card.id} type="button" data-matching-card="" data-side={side} data-card-id={card.id}
                  ref={(node) => { if (node) cards.current.set(`${side}:${card.id}`, node); else cards.current.delete(`${side}:${card.id}`); }}
                  disabled={disabled} aria-pressed={active || Boolean(link)}
                  aria-label={`${card.label}${target ? `. Связано: ${target.label}. Связь ${number}` : ""}`}
                  onClick={(event) => { const skip = suppressClick.current && event.detail > 0; suppressClick.current = false; if (!skip) pick(side, card.id); }}
                  onPointerDown={(event) => {
                    if (disabled || !event.isPrimary || event.button !== 0) return;
                    suppressClick.current = false;
                    drag.current = { side, id: card.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={pointerMove} onPointerUp={(event) => pointerEnd(event)}
                  onPointerCancel={(event) => pointerEnd(event, true)} onLostPointerCapture={stopDrag}
                  style={{ touchAction: "pan-y" }}
                  className={cn("min-h-16 min-w-0 rounded-xl border-2 bg-white px-3 py-4 text-left text-sm font-bold break-words text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 select-none sm:text-base",
                    active ? "border-sky-500 bg-sky-50" : link ? "border-sky-300 bg-sky-50" : "border-neutral-200",
                    !disabled && "cursor-pointer hover:border-sky-400")}
                >
                  {card.label}
                  {number !== null && <span aria-hidden="true" className="ml-2 inline-block rounded bg-sky-100 px-1.5 text-xs text-sky-700">{number}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-neutral-600">{selected ? "Теперь выбери карточку в другой колонке." : `Соединено: ${pairs.length} из ${left.length}`}</p>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !pairs.length} onClick={() => { onChange([]); setSelected(null); }}>Сбросить связи</Button>
      </div>
    </div>
  );
}
