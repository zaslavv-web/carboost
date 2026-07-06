import { useEffect, useRef, type ElementType } from "react";
import { useDeckCtx, useDeckValue } from "./DeckContentContext";

type Props = {
  id: string;
  defaultValue: string;
  as?: ElementType;
  className?: string;
  multiline?: boolean;
};

/**
 * Inline-редактируемый текстовый узел.
 * Вне режима редактирования — обычный DOM. В режиме — contentEditable.
 */
export default function Editable({
  id,
  defaultValue,
  as: Tag = "span",
  className = "",
  multiline = false,
}: Props) {
  const { editMode, setValue } = useDeckCtx();
  const value = useDeckValue(id, defaultValue);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  const handleBlur = () => {
    const el = ref.current;
    if (!el) return;
    const next = (el.textContent ?? "").replace(/\u00A0/g, " ");
    if (next !== value) setValue(id, next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (ref.current) ref.current.textContent = value;
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const editClass = editMode
    ? "outline outline-1 outline-dashed outline-[#8C6A1A]/60 rounded-sm px-0.5 -mx-0.5 hover:outline-[#8C6A1A] focus:outline-solid focus:outline-[#8C6A1A] cursor-text transition-colors"
    : "";

  return (
    <Tag
      ref={ref as any}
      className={`${className} ${editClass}`}
      contentEditable={editMode}
      suppressContentEditableWarning
      spellCheck={editMode}
      onBlur={editMode ? handleBlur : undefined}
      onKeyDown={editMode ? handleKeyDown : undefined}
    >
      {value}
    </Tag>
  );
}
