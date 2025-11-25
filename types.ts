import { LucideIcon } from 'lucide-react';

export interface SmartTagDef {
  keywords: string[];
  label: string;
  color: string;
}

export interface Tag {
  label: string;
  color: string;
}

export interface Stage {
  id: string;
  label: string;
  color: string;
  border: string;
  bar: string;
  icon: LucideIcon;
}

export interface ProductionItem {
  id?: string;
  title: string;
  client: string;
  taskName: string;
  stage: string;
  tags?: Tag[];
  startDate: string;
  duration: number;
  priority: string;
  progress: number;
  createdAt?: number;
}

export interface GroupedOrder {
  id: string;
  title: string;
  client: string;
  items: ProductionItem[];
  minStart: string;
  maxEnd: string;
  totalProgress: number;
}

export interface StatData {
  total: number;
  overdue: number;
  active: number;
  completed: number;
}