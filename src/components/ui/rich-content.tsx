import { contentToSafeHtml } from "@/lib/richText";
import { cn } from "@/lib/utils";

export function RichContent({ value, className }: { value: string; className?: string }) {
  return (
    <div
      className={cn("prose prose-sm max-w-none break-words dark:prose-invert prose-img:max-h-[32rem] prose-img:rounded-md prose-video:w-full", className)}
      dangerouslySetInnerHTML={{ __html: contentToSafeHtml(value) }}
    />
  );
}