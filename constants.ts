import { Layout, Settings, Zap, Package, CheckSquare } from 'lucide-react';
import { Stage, SmartTagDef } from './types';

export const APP_ID = 'proflow-demo-app';

export const STAGES: Stage[] = [
  { id: 'design', label: 'Thiết kế', color: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200', bar: 'bg-indigo-500', icon: Layout },
  { id: 'engineering', label: 'Kỹ thuật', color: 'bg-cyan-50 text-cyan-700', border: 'border-cyan-200', bar: 'bg-cyan-500', icon: Settings },
  { id: 'cnc', label: 'Gia công', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500', icon: Zap },
  { id: 'production', label: 'Sản xuất', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', icon: Package },
  { id: 'warranty', label: 'Bảo hành', color: 'bg-slate-50 text-slate-600', border: 'border-slate-200', bar: 'bg-slate-500', icon: CheckSquare }
];

// Hệ thống Tag thông minh (Tự động nhận diện từ tên công việc)
export const SMART_TAGS: SmartTagDef[] = [
  { keywords: ['gỗ', 'ván', 'mdf', 'melamine', 'laminat'], label: 'Gỗ', color: 'bg-orange-100 text-orange-700' },
  { keywords: ['sắt', 'inox', 'thép', 'hàn', 'kim loại'], label: 'Kim loại', color: 'bg-slate-200 text-slate-700' },
  { keywords: ['sơn', 'phủ', 'pu', 'tĩnh điện'], label: 'Sơn', color: 'bg-pink-100 text-pink-700' },
  { keywords: ['kính', 'gương', 'thủy'], label: 'Kính', color: 'bg-sky-100 text-sky-700' },
  { keywords: ['đá', 'granite', 'marble'], label: 'Đá', color: 'bg-stone-200 text-stone-700' },
  { keywords: ['điện', 'led', 'nguồn'], label: 'Điện', color: 'bg-yellow-100 text-yellow-700' },
  { keywords: ['lắp', 'ráp', 'đặt'], label: 'Lắp đặt', color: 'bg-lime-100 text-lime-700' }
];