import {
  Archive,
  AudioLines,
  Calculator,
  Code,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  QrCode,
  Sheet,
  ShieldCheck,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { CategorySlug } from "@/types/tool";

const icons: Record<CategorySlug, LucideIcon> = {
  pdf: FileText,
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  archive: Archive,
  text: Type,
  developer: Code,
  data: Sheet,
  security: ShieldCheck,
  qr: QrCode,
  calculators: Calculator,
  files: FolderOpen,
  web: Globe,
};

export function CategoryIcon({ category, className }: { category: CategorySlug; className?: string }) {
  const I = icons[category];
  return <I className={className ?? "h-4 w-4"} aria-hidden strokeWidth={1.75} />;
}
