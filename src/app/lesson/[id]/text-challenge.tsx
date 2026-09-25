"use client";

type TextChallengeProps = {
  value: string;
  onChange: (value: string) => void;
  status: "none" | "correct" | "wrong";
  disabled?: boolean;
};

export function TextChallenge({
  value,
  onChange,
  status,
  disabled = false,
}: TextChallengeProps) {
  return (
    <div className="flex flex-col gap-y-2">
      <label htmlFor="text-answer" className="font-bold text-neutral-700">
        Твой ответ
      </label>
      <input
        id="text-answer"
        type="text"
        autoComplete="off"
        maxLength={1000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || status !== "none"}
        aria-invalid={status === "wrong"}
        className={
          "w-full rounded-xl border-2 p-4 text-lg font-medium outline-none transition " +
          (status === "correct"
            ? "border-green-400 bg-green-50 text-green-700"
            : status === "wrong"
              ? "border-rose-400 bg-rose-50 text-rose-700"
              : "border-neutral-200 text-neutral-700 focus:border-sky-300")
        }
      />
      <p className="text-sm text-neutral-400">
        Регистр, лишние пробелы и знак в конце фразы не важны.
      </p>
    </div>
  );
}
