import {
  Activity, BarChart3, Coins, Download, FileText, Folder, HelpCircle, Inbox, KeyRound, Laptop, LayoutGrid, Link2, List, Mail, Package,
  Palette, Puzzle, QrCode, ReceiptText, RotateCcw, Rss, Settings, ShieldCheck, ShoppingCart, Sparkles, Stethoscope, Store, Truck, User,
  Users, Wallet, type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/config/modules';

const ICONS: Record<IconName, LucideIcon> = {
  overview: LayoutGrid, users: Users, store: Store, shield: ShieldCheck, list: List, puzzle: Puzzle, palette: Palette, file: FileText,
  rss: Rss, inbox: Inbox, help: HelpCircle, mail: Mail, link: Link2, sparkles: Sparkles, stethoscope: Stethoscope, qr: QrCode,
  folder: Folder, download: Download, settings: Settings, key: KeyRound, devices: Laptop, user: User, receipt: ReceiptText,
  cart: ShoppingCart, package: Package, truck: Truck, rotate: RotateCcw, wallet: Wallet, coins: Coins, chart: BarChart3, activity: Activity,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C aria-hidden className={className} />;
}
