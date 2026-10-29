import { Construction } from "lucide-react";

/** Заглушка раздела, который появится на одном из следующих этапов (DESIGN.md, раздел 15). */
export function ComingSoon({ title, stage }: { title: string; stage: number }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-muted-foreground">
        <Construction className="size-5 shrink-0" aria-hidden />
        <p>Раздел появится на этапе {stage}.</p>
      </div>
    </div>
  );
}
