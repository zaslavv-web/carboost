import { useEffect, useRef, useState } from "react";
import { useDeckCtx, useDeckNumber } from "./DeckContentContext";

type Props = {
  id: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  format?: (n: number) => string;
  onChange?: (n: number) => void;
};

export default function NumericEditable({
  id,
  defaultValue,
  min = 0,
  max = 999_999_999,
  step = 1,
  suffix,
  className = "",
  format,
  onChange,
}: Props) {
  const { editMode, setValue } = useDeckCtx();
  const value = useDeckNumber(id, defaultValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const n = Number(draft);
    const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setValue(id, String(clamped));
    onChange?.(clamped);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(String(value));
    setEditing(false);
  };

  const display = format ? format(value) : value.toLocaleString("ru-RU");

  if (editMode && editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        className={`${className} bg-white border border-[#8C6A1A] rounded px-1 outline-none w-24 text-right text-[#1B1D22]`}
      />
    );
  }

  return (
    <span
      role={editMode ? "button" : undefined}
      tabIndex={editMode ? 0 : -1}
      onClick={() => editMode && setEditing(true)}
      onKeyDown={(e) => {
        if (editMode && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`${className} ${editMode ? "outline outline-1 outline-dashed outline-[#8C6A1A]/60 rounded-sm px-0.5 -mx-0.5 hover:outline-[#8C6A1A] cursor-text" : ""}`}
    >
      {display}
      {suffix ? <span className="ml-1 opacity-70">{suffix}</span> : null}
    </span>
  );
}
