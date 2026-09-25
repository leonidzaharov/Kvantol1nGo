import { Card } from "./card";

type ChallengeProps = {
  options: string[];
  onSelect: (index: number) => void;
  status: "correct" | "wrong" | "none";
  selectedOption?: number;
  disabled?: boolean;
};

export const Challenge = ({
  options,
  onSelect,
  status,
  selectedOption,
  disabled,
}: ChallengeProps) => {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {options.map((option, i) => (
        <Card
          key={i}
          text={option}
          shortcut={`${i + 1}`}
          selected={selectedOption === i}
          onClick={() => onSelect(i)}
          status={status}
          disabled={disabled}
        />
      ))}
    </div>
  );
};
