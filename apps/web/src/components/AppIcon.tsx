import type { Icon, IconProps } from "@phosphor-icons/react";
import {
  ArrowLeft,
  ArrowRight,
  ChartLineUp,
  Check,
  Checks,
  ClipboardText,
  Clock,
  CloudArrowUp,
  Copy,
  Database,
  DotsThreeOutline,
  DownloadSimple,
  Eye,
  File,
  Files,
  FileText,
  FadersHorizontal,
  House,
  ImageSquare,
  Info,
  List,
  ListChecks,
  MagnifyingGlass,
  MapPin,
  NotePencil,
  PencilSimple,
  Plus,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  Trash,
  UsersThree,
  VideoCamera,
  Waveform,
  X,
} from "@phosphor-icons/react";

export type AppIconName =
  | "home"
  | "tasks"
  | "review"
  | "records"
  | "forms"
  | "insights"
  | "more"
  | "search"
  | "filter"
  | "plus"
  | "arrow"
  | "back"
  | "check"
  | "people"
  | "locations"
  | "data"
  | "reports"
  | "settings"
  | "logout"
  | "download"
  | "sparkles"
  | "menu"
  | "close"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "edit"
  | "eye"
  | "copy"
  | "template"
  | "unpublish"
  | "trash"
  | "clock"
  | "info";

const icons: Record<AppIconName, Icon> = {
  home: House,
  tasks: ClipboardText,
  review: Checks,
  records: Files,
  forms: ListChecks,
  insights: ChartLineUp,
  more: DotsThreeOutline,
  search: MagnifyingGlass,
  filter: FadersHorizontal,
  plus: Plus,
  arrow: ArrowRight,
  back: ArrowLeft,
  check: Check,
  people: UsersThree,
  locations: MapPin,
  data: Database,
  reports: FileText,
  settings: SlidersHorizontal,
  logout: SignOut,
  download: DownloadSimple,
  sparkles: Sparkle,
  menu: List,
  close: X,
  image: ImageSquare,
  audio: Waveform,
  video: VideoCamera,
  file: File,
  edit: PencilSimple,
  eye: Eye,
  copy: Copy,
  template: NotePencil,
  unpublish: CloudArrowUp,
  trash: Trash,
  clock: Clock,
  info: Info,
};

export function AppIcon({
  name,
  size = 20,
  weight = "regular",
  ...props
}: { name: AppIconName } & IconProps) {
  const Component = icons[name];
  return (
    <Component
      aria-hidden="true"
      focusable="false"
      size={size}
      weight={weight}
      {...props}
    />
  );
}
