import Image from "next/image";
import { cn } from "@/lib/utils";

/** Фото мастера 4:5 или инициалы, если фото ещё нет. */
export function MasterAvatar({
  name,
  photoPath,
  className,
  sizes = "160px",
  preload = false,
}: {
  name: string;
  photoPath: string | null;
  className?: string;
  sizes?: string;
  preload?: boolean; // фото на первом экране — грузить сразу
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div
      className={cn(
        "relative aspect-[4/5] overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      {photoPath ? (
        <Image
          src={`/uploads/${photoPath}`}
          alt={`Фото: ${name}`}
          fill
          sizes={sizes}
          preload={preload}
          className="object-cover"
        />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground"
          aria-hidden
        >
          {initials}
        </span>
      )}
    </div>
  );
}
