import { useEffect, useRef, useState, type ReactNode } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { Bold, Italic, UnderlineIcon, List, ListOrdered, Link2, ImageIcon, Video, Upload, Undo2, Redo2, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { laravelStorage } from "@/integrations/laravel/storage";
import { contentToSafeHtml, sanitizeRichHtml } from "@/lib/richText";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
    };
  },
});

const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes: () => ({ src: { default: null }, controls: { default: true }, preload: { default: "metadata" } }),
  parseHTML: () => [{ tag: "video" }],
  renderHTML: ({ HTMLAttributes }) => ["video", mergeAttributes(HTMLAttributes, { controls: "", preload: "metadata" })],
});

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Максимальная высота области ввода — дальше появляется скролл, а не растягивание страницы. */
  maxHeight?: string;
};

export function RichTextEditor({ value, onChange, placeholder = "Начните писать…", minHeight = "220px", maxHeight = "40vh" }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  // Последний HTML, отданный наружу: нужен, чтобы входящий `value` (уже
  // прошедший санитайзер) не сбрасывал контент редактора на каждом нажатии
  // клавиши — из-за этого терялись выделение и применённое форматирование.
  const emitted = useRef<string>(value);
  const selection = useRef({ from: 1, to: 1 });
  const [uploading, setUploading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      Image.configure({ allowBase64: false }),
      FontSize,
      FontFamily,
      VideoNode,
    ],
    content: value ? contentToSafeHtml(value) : "",
    editorProps: {
      attributes: {
        class: "rich-text-editor max-w-none px-4 py-3 focus:outline-none",
        style: `min-height:${minHeight}`,
        "aria-label": placeholder,
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
          const all = TextSelection.create(view.state.doc, 0, view.state.doc.content.size);
          view.dispatch(view.state.tr.setSelection(all));
          return true;
        }
        return false;
      },
    },
    onSelectionUpdate: ({ editor: current }) => {
      selection.current = { from: current.state.selection.from, to: current.state.selection.to };
    },
    onUpdate: ({ editor: current }) => {
      const html = sanitizeRichHtml(current.getHTML());
      emitted.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === emitted.current || editor.getHTML() === value) return;
    emitted.current = value;
    editor.commands.setContent(value ? contentToSafeHtml(value) : "", { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (!editor) return null;

  const upload = async (file: File, kind: "image" | "video") => {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || (kind === "image" ? "jpg" : "mp4");
    const path = `${kind}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await laravelStorage.from("content-media").upload(path, file);
    setUploading(false);
    if (error || !data?.url) {
      toast.error(error?.message || "Не удалось загрузить файл");
      return;
    }
    if (kind === "image") {
      const alt = window.prompt("Описание изображения для доступности", file.name) || file.name;
      editor.chain().focus().setImage({ src: data.url, alt }).run();
    } else {
      editor.chain().focus().insertContent({ type: "video", attrs: { src: data.url } }).run();
    }
  };

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Адрес ссылки", previous || "https://");
    if (href === null) return;
    if (!href) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const insertVideoUrl = () => {
    const src = window.prompt("Прямая HTTPS-ссылка на видео (MP4 или WebM)", "https://");
    if (!src) return;
    if (!/^https:\/\/.+\.(mp4|webm)(?:[?#].*)?$/i.test(src)) {
      toast.error("Укажите прямую HTTPS-ссылку на файл MP4 или WebM");
      return;
    }
    editor.chain().focus().insertContent({ type: "video", attrs: { src } }).run();
  };

  // Смена типа блока: снимаем инлайновый размер шрифта, иначе заголовок
  // визуально остаётся обычным текстом (mark textStyle перекрывает h2/h3).
  const restoreSelection = () => editor.chain().focus().setTextSelection(selection.current);

  const applyBlockType = (v: string) => {
    const chain = restoreSelection().unsetMark("textStyle");
    if (v === "p") chain.setParagraph().run();
    else chain.setHeading({ level: v === "h2" ? 2 : 3 }).run();
  };

  const blockValue = editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p";

  const tool = (label: string, icon: ReactNode, action: () => void, active = false, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant={active ? "secondary" : "ghost"} className="h-8 w-8" onMouseDown={(event) => event.preventDefault()} onClick={action} disabled={disabled} aria-label={label}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring",
          fullscreen && "fixed inset-0 z-[120] rounded-none",
        )}
      >
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b bg-muted/40 p-1.5" onPointerDown={() => {
          selection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
        }}>
          <Select value={blockValue} onValueChange={applyBlockType}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="p">Текст</SelectItem><SelectItem value="h2">Заголовок</SelectItem><SelectItem value="h3">Подзаголовок</SelectItem></SelectContent>
          </Select>
          <Select value={editor.getAttributes("textStyle").fontFamily || "Inter"} onValueChange={(v) => editor.chain().focus().setFontFamily(v).run()}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Inter">Inter</SelectItem><SelectItem value="Instrument Serif">Serif</SelectItem><SelectItem value="Golos Text">Golos</SelectItem></SelectContent>
          </Select>
          <Select value={editor.getAttributes("textStyle").fontSize || "16px"} onValueChange={(fontSize) => editor.chain().focus().setMark("textStyle", { fontSize }).run()}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="14px">14</SelectItem><SelectItem value="16px">16</SelectItem><SelectItem value="18px">18</SelectItem><SelectItem value="24px">24</SelectItem><SelectItem value="32px">32</SelectItem></SelectContent>
          </Select>
          {tool("Жирный", <Bold className="h-4 w-4" />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
          {tool("Курсив", <Italic className="h-4 w-4" />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
          {tool("Подчёркивание", <UnderlineIcon className="h-4 w-4" />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
          {tool("Маркированный список", <List className="h-4 w-4" />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
          {tool("Нумерованный список", <ListOrdered className="h-4 w-4" />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
          {tool("Ссылка", <Link2 className="h-4 w-4" />, setLink, editor.isActive("link"))}
          {tool("Изображение", <ImageIcon className="h-4 w-4" />, () => fileRef.current?.click(), false, uploading)}
          {tool("Видео по ссылке", <Video className="h-4 w-4" />, insertVideoUrl, false, uploading)}
          {tool("Загрузить видео", uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />, () => videoRef.current?.click(), false, uploading)}
          <span className="ml-auto flex gap-1">
            {tool(fullscreen ? "Свернуть редактор" : "Развернуть на весь экран", fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />, () => setFullscreen((v) => !v), fullscreen)}
            {tool("Отменить", <Undo2 className="h-4 w-4" />, () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
            {tool("Повторить", <Redo2 className="h-4 w-4" />, () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
          </span>
        </div>
        <EditorContent
          editor={editor}
          className={cn("cursor-text select-text overflow-y-auto", fullscreen ? "flex-1" : undefined, uploading && "opacity-60")}
          style={fullscreen ? undefined : { maxHeight }}
        />
        <input ref={fileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, "image"); e.target.value = ""; }} />
        <input ref={videoRef} className="hidden" type="file" accept="video/mp4,video/webm" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, "video"); e.target.value = ""; }} />
      </div>
    </TooltipProvider>
  );
}
