import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, CheckSquare, Layout, Filter, Plus, Search, ChevronRight, 
  ChevronDown, AlertCircle, MoreHorizontal, X, Save, Trash2, 
  UploadCloud, Loader2, RefreshCw, Link as LinkIcon, AlertTriangle, 
  Zap, Activity, Package, Copy, Layers, List, Edit3, Tag, FileSpreadsheet
} from 'lucide-react';
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query } from "firebase/firestore";

import { auth, db } from './services/firebase';
import { APP_ID, STAGES, SMART_TAGS } from './constants';
import { ProductionItem, Tag as TagType, GroupedOrder, StatData } from './types';

// --- Helper Functions ---

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(line.substring(start, i).replace(/^"|"$/g, '').trim());
      start = i + 1;
    }
  }
  result.push(line.substring(start).replace(/^"|"$/g, '').trim());
  return result;
};

const getCleanSheetUrl = (url: string): string => {
  if (!url) return '';
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
  }
  return url;
};

const formatDateVN = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
};

const addDays = (dateStr: string, days: number): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

const detectTags = (text: string): TagType[] => {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  return SMART_TAGS
    .filter(tag => tag.keywords.some(k => lowerText.includes(k)))
    .map(t => ({ label: t.label, color: t.color }));
};

// --- Sub-Components ---

const Logo3D = () => (
  <div className="w-10 h-10 relative group cursor-pointer">
    <div className="absolute inset-0 bg-blue-600 rounded-xl transform rotate-3 group-hover:rotate-6 transition-transform opacity-20"></div>
    <div className="absolute inset-0 bg-indigo-600 rounded-xl transform -rotate-3 group-hover:-rotate-6 transition-transform opacity-20"></div>
    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg flex items-center justify-center text-white">
      <Layers size={22} strokeWidth={2.5} />
    </div>
  </div>
);

const Badge = ({ stageId, customLabel, tags = [] }: { stageId: string, customLabel?: string, tags?: TagType[] }) => {
  const stage = STAGES.find(s => s.id === stageId) || STAGES[0];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${stage.color} ${stage.border} shadow-sm whitespace-nowrap`}>
        {customLabel || stage.label}
      </span>
      {tags.map((t, idx) => (
        <span key={idx} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${t.color}`}>{t.label}</span>
      ))}
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, subColor }: { title: string, value: number, icon: any, color: string, subColor: string }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_25px_-10px_rgba(0,0,0,0.1)] transition-all duration-300 group relative overflow-hidden">
    <div className={`absolute top-0 right-0 w-20 h-20 ${subColor} rounded-full -mr-10 -mt-10 opacity-50 transition-transform group-hover:scale-150`}></div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{value}</h3>
      </div>
      <div className={`p-3 rounded-xl ${subColor} text-white shadow-sm`}>
        <Icon size={22} strokeWidth={2.5} />
      </div>
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, children }: { isOpen: boolean, onClose: () => void, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto animate-slide-in border-l border-slate-100 flex flex-col">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Chi tiết công việc</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">Chỉnh sửa thông tin tiến độ</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-800 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'gantt' | 'board' | 'list'>('gantt'); 
  const [filterStage, setFilterStage] = useState('all');
  const [smartFilter, setSmartFilter] = useState('all'); // 'overdue', 'today', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState(new Set<string>());
  const [editingItem, setEditingItem] = useState<ProductionItem | null>(null);
  const [expandedOrders, setExpandedOrders] = useState(new Set<string>()); 
  
  // Interaction State
  const [activeItemId, setActiveItemId] = useState<string | null>(null); 
  const [viewStartDate, setViewStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });

  // Sheet Integration State
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState(() => localStorage.getItem('proflow_sheet_url') || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // --- Firebase Auth & Data ---

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error (Check firebase.ts config):", error);
        setLoading(false); // Stop loading so UI shows
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
        // Fallback for demo purposes if auth fails or not configured
        if (!loading) return; // already failed auth
        return;
    }
    
    // Safety check for DB connection
    try {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'production_items'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedItems = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ProductionItem[];
          fetchedItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setItems(fetchedItems);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching data:", error);
          setLoading(false);
        });
        return () => unsubscribe();
    } catch (e) {
        console.error("Firestore Init Error:", e);
        setLoading(false);
    }
  }, [user]);

  // Helper tính trạng thái thông minh
  const getSmartStatus = (item: ProductionItem) => {
    const today = new Date().setHours(0,0,0,0);
    const end = new Date(addDays(item.startDate, item.duration)).getTime();
    const start = new Date(item.startDate).getTime();
    
    if (item.progress >= 100) return 'completed';
    if (end < today) return 'overdue';
    if (end === today || (start <= today && end >= today)) return 'active';
    return 'upcoming';
  };

  // Computed Data
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesStage = filterStage === 'all' || item.stage === filterStage;
      const matchesSearch = (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (item.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (item.taskName || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesSmart = true;
      const status = getSmartStatus(item);
      if (smartFilter === 'overdue') matchesSmart = status === 'overdue';
      if (smartFilter === 'active') matchesSmart = status === 'active' || status === 'overdue';
      
      return matchesStage && matchesSearch && matchesSmart;
    });
  }, [items, filterStage, searchQuery, smartFilter]);

  // Stats
  const stats: StatData = useMemo(() => {
    return {
      total: items.length,
      overdue: items.filter(i => getSmartStatus(i) === 'overdue').length,
      active: items.filter(i => getSmartStatus(i) === 'active').length,
      completed: items.filter(i => i.progress >= 100).length
    };
  }, [items]);

  // Actions
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedItems(newSelected);
  };

  const toggleOrder = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) newExpanded.delete(orderId);
    else newExpanded.add(orderId);
    setExpandedOrders(newExpanded);
  };

  // --- Auto-Scroll Logic ---
  const handleItemClick = (item: ProductionItem) => {
    if (item.id) setActiveItemId(item.id);
    const itemStart = new Date(item.startDate);
    const newViewStart = new Date(itemStart);
    newViewStart.setDate(itemStart.getDate() - 3);
    setViewStartDate(newViewStart);
  };

  const handleOrderClick = (group: GroupedOrder) => {
    toggleOrder(group.id);
    if (!expandedOrders.has(group.id)) {
        setActiveItemId(group.id); 
        const groupStart = new Date(group.minStart);
        const newViewStart = new Date(groupStart);
        newViewStart.setDate(groupStart.getDate() - 3);
        setViewStartDate(newViewStart);
    }
  };

  const handleBulkAction = async (action: 'delete') => {
    if (selectedItems.size === 0) return;
    const batchPromises: Promise<void>[] = [];
    if (action === 'delete') {
      selectedItems.forEach(id => {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'production_items', id);
        batchPromises.push(deleteDoc(docRef));
      });
    }
    await Promise.all(batchPromises);
    setSelectedItems(new Set());
  };

  const saveItem = async (formData: ProductionItem) => {
    if (!user) {
        alert("Authentication required. Check firebase config.");
        return;
    }
    const collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'production_items');
    try {
      const newTags = detectTags(formData.taskName);
      const dataToSave = { ...formData, tags: newTags };

      if (formData.id) {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'production_items', formData.id);
        const { id, ...data } = dataToSave;
        await updateDoc(docRef, data);
      } else {
        await addDoc(collectionRef, {
          ...dataToSave,
          createdAt: Date.now()
        });
      }
      setEditingItem(null);
    } catch (e) {
      console.error("Error saving: ", e);
      alert("Error saving data. Check console.");
    }
  };

  const deleteSingleItem = async (id?: string) => {
    if (!user || !id) return;
    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'production_items', id));
    setEditingItem(null);
  }

  // --- Smart Import Logic ---
  const handleImport = async () => {
    if (!importUrl) return;
    setIsSyncing(true);
    setImportStatus(null);
    try {
      const sheetCsvUrl = getCleanSheetUrl(importUrl);
      localStorage.setItem('proflow_sheet_url', importUrl);
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(sheetCsvUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
      const csvText = await response.text();
      if (csvText.trim().startsWith("<!DOCTYPE") || csvText.trim().startsWith("<html")) {
        throw new Error("HTML content detected. Ensure Sheet is 'Anyone with the link'.");
      }
      const lines = csvText.split('\n').filter(l => l.trim());
      if (lines.length < 2) throw new Error("CSV file is empty or missing data.");
      
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
      const colMap = {
        title: headers.findIndex(h => h.includes('id') || h.includes('mã') || h.includes('tên') || h.includes('loại hàng') || h.includes('project')),
        client: headers.findIndex(h => h.includes('workstream') || h.includes('khách') || h.includes('client')),
        stage: headers.findIndex(h => h.includes('công việc') || h.includes('task') || h.includes('description') || h.includes('mô tả') || h.includes('status') || h.includes('giai đoạn')),
        priority: headers.findIndex(h => h.includes('ưu tiên') || h.includes('priority')),
        duration: headers.findIndex(h => h.includes('số ngày') || h.includes('duration') || h.includes('days')),
        start: headers.findIndex(h => h.includes('started') || h.includes('bắt đầu') || h.includes('date'))
      };
      
      const collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'production_items');
      const promises = lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        if (cols.length < 2) return null;
        
        const titleVal = colMap.title > -1 ? cols[colMap.title] : cols[0];
        const clientVal = colMap.client > -1 ? cols[colMap.client] : cols[1];
        if (!titleVal) return null;

        const rawTaskName = colMap.stage > -1 ? cols[colMap.stage] : cols[3];
        const stageRawLower = (rawTaskName || '').toLowerCase();
        
        let mappedStage = 'design';
        if (stageRawLower.includes('file') || stageRawLower.includes('lịch') || stageRawLower.includes('design') || stageRawLower.includes('thiết kế')) mappedStage = 'design';
        else if (stageRawLower.includes('kỹ thuật') || stageRawLower.includes('eng')) mappedStage = 'engineering';
        else if (stageRawLower.includes('sản xuất') || stageRawLower.includes('xưởng')) mappedStage = 'production';
        else if (stageRawLower.includes('giao') || stageRawLower.includes('lắp')) mappedStage = 'production';
        else if (stageRawLower.includes('đá') || stageRawLower.includes('kính') || stageRawLower.includes('cnc')) mappedStage = 'cnc';
        else if (stageRawLower.includes('bảo hành') || stageRawLower.includes('warranty')) mappedStage = 'warranty';

        const tags = detectTags(rawTaskName);

        // Simple duplicate check based on title + taskName
        const exists = items.some(i => i.title === titleVal && i.taskName === rawTaskName);
        if (exists) return null;

        const durVal = colMap.duration > -1 ? cols[colMap.duration] : '5';
        const parsedDur = Math.abs(parseInt(durVal)) || 5;
        const prioVal = colMap.priority > -1 ? cols[colMap.priority] : 'Medium';
        const startVal = colMap.start > -1 ? cols[colMap.start] : '';
        let finalStartDate = new Date().toISOString().split('T')[0];
        if (startVal) {
          const ddmmyyyy = startVal.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
          if (ddmmyyyy) finalStartDate = `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
          else if (!isNaN(Date.parse(startVal))) finalStartDate = new Date(startVal).toISOString().split('T')[0];
        }
        return addDoc(collectionRef, {
          title: titleVal || 'Untitled', 
          client: clientVal || 'Unknown', 
          taskName: rawTaskName || 'Công việc mới', 
          stage: mappedStage, 
          tags: tags,
          startDate: finalStartDate, 
          duration: parsedDur, 
          priority: prioVal || 'Medium', 
          progress: 0, 
          createdAt: Date.now()
        });
      }).filter(p => p !== null);
      
      if (promises.length > 0) {
        await Promise.all(promises);
        setImportStatus(`Success! Added ${promises.length} new items.`);
        setTimeout(() => setShowImport(false), 2500);
      } else {
        setImportStatus('No new data found or items already exist.');
      }
    } catch (error: any) {
      setImportStatus(`Error: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const clearSavedSheet = () => {
    localStorage.removeItem('proflow_sheet_url');
    setImportUrl('');
    setImportStatus(null);
  };

  // --- Views ---

  const ListView = () => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
               <th className="p-4 w-12 text-center border-b border-slate-200"><input type="checkbox" className="rounded border-slate-300"/></th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Dự án</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Công việc & Tags</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Thời gian</th>
              <th className="p-4 w-32 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Tiến độ</th>
              <th className="p-4 border-b border-slate-200"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredItems.map(item => (
              <tr key={item.id} className="group hover:bg-blue-50/40 transition-colors">
                <td className="p-4 text-center"><input type="checkbox" className="rounded border-slate-300"/></td>
                <td className="p-4 font-medium text-slate-800">{item.title}</td>
                <td className="p-4"><Badge stageId={item.stage} customLabel={item.taskName} tags={item.tags} /></td>
                <td className="p-4 text-xs text-slate-500 font-mono">
                  {formatDateVN(item.startDate)} - {formatDateVN(addDays(item.startDate, item.duration))}
                </td>
                <td className="p-4">
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${item.progress}%` }} />
                  </div>
                </td>
                <td className="p-4 text-right">
                  <button onClick={() => setEditingItem(item)} className="text-slate-400 hover:text-blue-600"><MoreHorizontal size={18}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const BoardView = () => (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full px-2 snap-x">
      {STAGES.map(stage => {
        const stageItems = filteredItems.filter(i => i.stage === stage.id);
        return (
          <div key={stage.id} className="min-w-[280px] max-w-[280px] bg-slate-50/50 rounded-2xl p-3 h-full border border-slate-100 flex flex-col snap-start">
             <div className={`flex items-center justify-between mb-3 px-1`}>
                <div className="flex items-center gap-2 font-bold text-slate-700">
                   <div className={`p-1.5 rounded-lg ${stage.color} bg-opacity-20`}>
                     <stage.icon size={14} />
                   </div>
                   {stage.label}
                </div>
                <span className="bg-white text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm border border-slate-100">{stageItems.length}</span>
             </div>
             
             <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-20 scrollbar-hide">
               {stageItems.map(item => (
                 <div 
                   key={item.id} 
                   onClick={() => setEditingItem(item)}
                   className={`bg-white p-3 rounded-xl shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all group relative ${item.id && selectedItems.has(item.id) ? 'ring-2 ring-blue-500' : ''}`}
                 >
                   <div className="flex justify-between items-start mb-2">
                     <div className="font-bold text-sm text-slate-800 leading-snug">{item.title}</div>
                     <input 
                       type="checkbox"
                       checked={item.id ? selectedItems.has(item.id) : false}
                       onChange={() => item.id && toggleSelection(item.id)}
                       onClick={(e) => e.stopPropagation()}
                       className={`rounded text-blue-600 w-4 h-4 ${item.id && selectedItems.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                     />
                   </div>
                   
                   <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${stage.bar}`}></span>
                      {item.taskName || stage.label}
                   </div>

                   {item.tags && item.tags.length > 0 && (
                     <div className="flex flex-wrap gap-1 mb-3">
                       {item.tags.map((t, i) => (
                         <span key={i} className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold ${t.color}`}>{t.label}</span>
                       ))}
                     </div>
                   )}

                   <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                      <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                         {formatDateVN(item.startDate)}
                      </div>
                      <div className="flex items-center gap-2">
                         <div className="h-1 w-12 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${item.progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${item.progress}%` }} />
                         </div>
                         <span className="text-[10px] font-bold text-slate-600">{item.progress}%</span>
                      </div>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        );
      })}
    </div>
  );

  // --- GANTT VIEW ---
  const GanttView = () => {
    const dayWidth = 40; 
    const today = new Date();
    const viewDuration = 45;

    const getOffset = (dateStr: string) => {
      const itemDate = new Date(dateStr);
      const diffTime = itemDate.getTime() - viewStartDate.getTime(); 
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return diffDays * dayWidth;
    };

    const groupedByOrder: GroupedOrder[] = useMemo(() => {
      const groups: Record<string, GroupedOrder> = {};
      filteredItems.forEach(item => {
        if (!groups[item.title]) {
          groups[item.title] = {
            id: item.title,
            title: item.title,
            client: item.client,
            items: [],
            minStart: item.startDate,
            maxEnd: addDays(item.startDate, item.duration),
            totalProgress: 0
          };
        }
        groups[item.title].items.push(item);
        if (new Date(item.startDate) < new Date(groups[item.title].minStart)) groups[item.title].minStart = item.startDate;
        const itemEnd = addDays(item.startDate, item.duration);
        if (new Date(itemEnd) > new Date(groups[item.title].maxEnd)) groups[item.title].maxEnd = itemEnd;
      });
      return Object.values(groups).map(g => {
        g.totalProgress = Math.round(g.items.reduce((acc, i) => acc + i.progress, 0) / g.items.length);
        g.items.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        return g;
      });
    }, [filteredItems]);

    const toggleAllOrders = () => {
      if (expandedOrders.size === groupedByOrder.length) {
        setExpandedOrders(new Set());
      } else {
        setExpandedOrders(new Set(groupedByOrder.map(g => g.id)));
      }
    };

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full select-none">
        
        {/* Gantt Header */}
        <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-white z-20">
          <div className="font-bold text-slate-800 flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Calendar size={18} /></div>
            Biểu đồ Gantt
          </div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-3">
             <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
               <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span> Hôm nay: {today.getDate()}/{today.getMonth() + 1}
             </div>
             <button 
                onClick={toggleAllOrders}
                className="hover:bg-slate-100 px-3 py-1.5 rounded-lg text-slate-600 transition-colors border border-transparent hover:border-slate-200"
             >
               {expandedOrders.size === groupedByOrder.length ? 'Thu gọn' : 'Mở rộng'}
             </button>
          </div>
        </div>

        {/* Main Gantt Area */}
        <div className="flex-1 overflow-hidden flex relative">
          
          {/* LEFT PANE: Task List */}
          <div className="w-[420px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col z-20 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="h-10 border-b border-slate-200 bg-slate-50/80 flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div className="flex-1 px-4">Mã Đơn / Công việc</div>
              <div className="w-20 text-center border-l border-slate-200/50">Bắt đầu</div>
              <div className="w-20 text-center border-l border-slate-200/50">Kết thúc</div>
            </div>
            
            <div className="flex-1 overflow-y-hidden hover:overflow-y-auto scrollbar-hide">
              {groupedByOrder.map(group => (
                <div key={group.id}>
                  {/* Group Header */}
                  <div 
                    onClick={() => handleOrderClick(group)}
                    className={`h-10 flex items-center hover:bg-slate-50 cursor-pointer border-b border-slate-100 transition-colors group ${activeItemId === group.id ? 'bg-indigo-50/80 border-indigo-100' : 'bg-white'}`}
                  >
                    <div className="flex-1 px-3 flex items-center gap-2 min-w-0">
                      {expandedOrders.has(group.id) ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>}
                      <div className="flex flex-col min-w-0">
                         <span className={`text-[12px] font-bold truncate ${activeItemId === group.id ? 'text-indigo-700' : 'text-slate-800'}`}>{group.title}</span>
                         <span className="text-[10px] text-slate-400 truncate flex items-center gap-1">{group.client} • {group.items.length} việc</span>
                      </div>
                    </div>
                    <div className="w-20 text-[10px] text-slate-500 text-center font-medium">{formatDateVN(group.minStart)}</div>
                    <div className="w-20 text-[10px] text-slate-500 text-center font-medium">{formatDateVN(group.maxEnd)}</div>
                  </div>
                  
                  {/* Items */}
                  {expandedOrders.has(group.id) && group.items.map(item => {
                    const stage = STAGES.find(s => s.id === item.stage) || STAGES[0];
                    const isActive = activeItemId === item.id;
                    const status = getSmartStatus(item);
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => setEditingItem(item)}
                        className={`h-[44px] flex items-center border-b border-slate-100 cursor-pointer group transition-colors pl-8 ${isActive ? 'bg-blue-50/80 border-l-4 border-l-blue-500' : 'hover:bg-slate-50/50 border-l-4 border-l-transparent'}`}
                      >
                        <div className="flex-1 px-3 flex items-center gap-2 min-w-0 pl-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'overdue' ? 'bg-red-500' : status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} title={status}></div>
                          
                          <div className="flex flex-col min-w-0">
                             <span className={`text-[12px] font-medium truncate ${isActive ? 'text-blue-700 font-bold' : 'text-slate-700'}`}>{item.taskName || stage.label}</span>
                             {item.tags && item.tags.length > 0 && (
                               <div className="flex gap-1 mt-0.5">
                                 {item.tags.map((t, i) => (
                                   <span key={i} className={`text-[8px] px-1 rounded ${t.color}`}>{t.label}</span>
                                 ))}
                               </div>
                             )}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} className={`p-1 rounded hover:bg-blue-100 text-blue-600 ml-auto mr-2 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                            <Edit3 size={12} />
                          </button>
                        </div>
                        <div className="w-20 text-[10px] text-slate-400 text-center">{formatDateVN(item.startDate)}</div>
                        <div className="w-20 text-[10px] text-slate-400 text-center">{formatDateVN(addDays(item.startDate, item.duration))}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT PANE: Timeline */}
          <div className="flex-1 overflow-x-auto overflow-y-auto relative scrollbar-hide" id="gantt-timeline">
            <div className="min-w-max">
              <div className="sticky top-0 z-10 bg-white h-10 border-b border-slate-200 flex">
                {Array.from({length: viewDuration}).map((_, i) => {
                   const d = new Date(viewStartDate); d.setDate(d.getDate() + i);
                   const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
                   const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                   return (
                     <div key={i} style={{ width: dayWidth }} className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100/50 text-[10px] ${isWeekend ? 'bg-slate-50/50' : ''} ${isToday ? 'bg-blue-50/50' : ''}`}>
                       <span className={`font-bold ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{d.getDate()}</span>
                       <span className="text-[8px] text-slate-300 font-bold uppercase">{['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]}</span>
                     </div>
                   );
                })}
              </div>

              <div>
                {groupedByOrder.map(group => (
                  <div key={group.id}>
                    {/* Group Summary Bar */}
                    <div className={`h-10 border-b border-slate-100 relative ${activeItemId === group.id ? 'bg-indigo-50/30' : 'bg-slate-50/10'}`}>
                       <div className="absolute inset-0 flex pointer-events-none">
                         {Array.from({length: viewDuration}).map((_, i) => {
                             const d = new Date(viewStartDate); d.setDate(d.getDate() + i);
                             const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                             return (<div key={i} style={{ width: dayWidth }} className={`border-r border-slate-100/30 h-full ${isWeekend ? 'bg-slate-50/20' : ''}`}></div>)
                         })}
                       </div>
                       <div className="absolute top-3 h-4 bg-slate-300/40 rounded-full z-0" style={{ left: getOffset(group.minStart), width: Math.max((new Date(group.maxEnd).getTime() - new Date(group.minStart).getTime()) / (1000 * 60 * 60 * 24) * dayWidth, 20) }}></div>
                    </div>
                    
                    {/* Task Bars */}
                    {expandedOrders.has(group.id) && group.items.map(item => {
                      const offset = getOffset(item.startDate);
                      const width = Math.max(item.duration * dayWidth, 20); 
                      const stage = STAGES.find(s => s.id === item.stage) || STAGES[0];
                      const status = getSmartStatus(item);
                      const isActive = activeItemId === item.id;
                      return (
                        <div 
                           key={item.id} 
                           className={`h-[44px] border-b border-slate-100 relative group transition-colors ${isActive ? 'bg-blue-50/30' : 'hover:bg-slate-50/30'}`}
                           onClick={() => handleItemClick(item)}
                        >
                           <div className="absolute inset-0 flex pointer-events-none">
                             {Array.from({length: viewDuration}).map((_, i) => {
                                const d = new Date(viewStartDate); d.setDate(d.getDate() + i);
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                return (<div key={i} style={{ width: dayWidth }} className={`border-r border-slate-100/50 h-full ${isWeekend ? 'bg-slate-50/20' : ''}`}></div>)
                             })}
                             {/* Red Line for Today */}
                             <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none opacity-40 dashed" style={{ left: getOffset(today.toISOString()) + (dayWidth/2) }}></div>
                           </div>
                           
                           <div 
                             onDoubleClick={() => setEditingItem(item)}
                             className={`absolute top-2.5 h-6 rounded shadow-sm text-white text-[9px] font-bold flex items-center px-2 overflow-hidden whitespace-nowrap cursor-pointer transition-all z-10 border border-white/20 ${stage.bar} ${status === 'overdue' ? 'ring-2 ring-red-500 ring-offset-1' : ''} ${isActive ? 'ring-2 ring-blue-500 ring-offset-1 scale-[1.02] shadow-md z-20' : 'hover:scale-[1.01] hover:shadow-md'}`}
                             style={{ left: offset, width: width }}
                           >
                             <div className="absolute inset-0 bg-black/10" style={{ width: `${item.progress}%` }}></div>
                             <span className="relative z-10 drop-shadow-md flex items-center gap-1">
                                {status === 'overdue' && <AlertCircle size={8} className="text-white animate-pulse"/>}
                                {item.progress}%
                             </span>
                           </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Form ---
  const EditForm = () => {
    const [formData, setFormData] = useState<ProductionItem>(editingItem || { 
      title: '', client: '', stage: 'design', taskName: '', startDate: new Date().toISOString().split('T')[0], duration: 1, priority: 'Medium', progress: 0, tags: [] 
    });
    const [copyText, setCopyText] = useState('Sao chép');

    const handleCopy = () => {
      const textToCopy = `📋 ${formData.title}\n-------------------\n👤 Khách: ${formData.client}\n🚧 Việc: ${formData.taskName}\n📅 Bắt đầu: ${formatDateVN(formData.startDate)}\n⏳ Thời hạn: ${formData.duration} ngày\n📊 Tiến độ: ${formData.progress}%`;
      navigator.clipboard.writeText(textToCopy);
      setCopyText('Đã chép!');
      setTimeout(() => setCopyText('Sao chép'), 2000);
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-5">
           <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mã Đơn / Dự Án</label>
            <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all focus:bg-white" />
           </div>
           
           <div className="col-span-2">
             <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tên Công Việc (Tự động gắn Tag)</label>
             <div className="relative">
               <input type="text" value={formData.taskName} onChange={e => setFormData({...formData, taskName: e.target.value})} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 pl-10 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all focus:bg-white" placeholder="VD: Cắt CNC sắt, Sơn tĩnh điện..." />
               <Edit3 className="absolute left-3 top-3.5 text-slate-400" size={16}/>
             </div>
             {/* Tags Preview */}
             <div className="flex gap-2 mt-2">
                {detectTags(formData.taskName).map((t,i) => (
                  <span key={i} className={`text-[10px] px-2 py-1 rounded font-bold ${t.color} flex items-center gap-1`}><Tag size={10}/> {t.label}</span>
                ))}
             </div>
           </div>

           <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Giai đoạn (Phân màu)</label>
            <div className="relative">
              <select value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 appearance-none text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" size={16}/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Độ ưu tiên</label>
            <div className="relative">
              <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 appearance-none text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
              <ChevronDown className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" size={16}/>
            </div>
          </div>
           <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ngày bắt đầu</label>
            <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Thời hạn (Ngày)</label>
            <input type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="flex justify-between mb-3">
               <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Tiến độ: {formData.progress}%</label>
            </div>
            <input type="range" min="0" max="100" value={formData.progress} onChange={e => setFormData({...formData, progress: parseInt(e.target.value)})} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>
        </div>
        <div className="pt-6 mt-6 border-t border-slate-100 flex justify-between items-center sticky bottom-0 bg-white pb-2">
          <button onClick={handleCopy} className="text-slate-500 hover:text-blue-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2"><Copy size={18} /> {copyText}</button>
          <div className="flex gap-3">
            {formData.id && <button onClick={() => deleteSingleItem(formData.id)} className="text-rose-500 hover:bg-rose-50 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2"><Trash2 size={18} /> Xóa</button>}
            <button onClick={() => saveItem(formData)} className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2"><Save size={18} /> Lưu</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-800 font-sans selection:bg-indigo-100 overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-[260px] bg-white border-r border-slate-200/60 flex flex-col z-20 flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6 pb-8">
          <div className="flex items-center gap-3 text-slate-900 mb-2">
            <Logo3D />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight leading-none text-slate-900">ProFlow</h1>
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">AI System</span>
            </div>
          </div>
        </div>

        <div className="px-4 space-y-8 flex-1 overflow-y-auto py-2 scrollbar-hide">
          
          <div className="space-y-1">
            <label className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 block">Bảng điều khiển</label>
            <button onClick={() => setSmartFilter('all')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${smartFilter === 'all' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
               <div className="flex items-center gap-3"><Layers size={18}/> Tất cả</div>
               <span className="bg-white px-2 py-0.5 rounded-md text-[10px] shadow-sm border border-slate-100">{stats.total}</span>
            </button>
            <button onClick={() => setSmartFilter('overdue')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${smartFilter === 'overdue' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'text-slate-500 hover:bg-red-50/50 hover:text-red-600'}`}>
               <div className="flex items-center gap-3"><AlertCircle size={18}/> Quá hạn</div>
               {stats.overdue > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-md text-[10px] shadow-sm">{stats.overdue}</span>}
            </button>
            <button onClick={() => setSmartFilter('active')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${smartFilter === 'active' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-slate-500 hover:bg-indigo-50/50 hover:text-indigo-600'}`}>
               <div className="flex items-center gap-3"><Zap size={18}/> Đang chạy</div>
               <span className="bg-white px-2 py-0.5 rounded-md text-[10px] shadow-sm border border-slate-100">{stats.active}</span>
            </button>
          </div>

          <div className="space-y-1">
            <label className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 block">Giao diện</label>
            {[
              { id: 'gantt', icon: Calendar, label: 'Tiến độ Gantt' },
              { id: 'board', icon: Layout, label: 'Bảng Kanban' },
              { id: 'list', icon: List, label: 'Danh sách' },
            ].map(v => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${view === v.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  <Icon size={18} strokeWidth={view === v.id ? 2.5 : 2} /> {v.label}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Import Box */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          {importUrl ? (
             <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
               <div className="flex items-center gap-2 mb-3 text-emerald-700 text-xs font-bold">
                 <div className="p-1 bg-emerald-100 rounded text-emerald-600"><LinkIcon size={12} /></div> Đã nối Sheet
               </div>
               <button onClick={handleImport} disabled={isSyncing} className="w-full mb-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-md shadow-emerald-200 hover:-translate-y-0.5">
                 {isSyncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14} />} {isSyncing ? 'Đang tải...' : 'Đồng bộ AI'}
               </button>
               {importStatus && <div className={`text-[10px] mb-2 text-center font-medium ${importStatus.includes('Lỗi') ? 'text-red-500' : 'text-emerald-600'}`}>{importStatus}</div>}
               <button onClick={clearSavedSheet} className="w-full text-[10px] font-bold text-slate-400 hover:text-rose-500 text-center transition-colors pt-2 border-t border-slate-50">Hủy liên kết</button>
             </div>
           ) : (
             <button onClick={() => setShowImport(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-slate-600 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 rounded-xl border border-slate-200 transition-all shadow-sm group">
               <UploadCloud size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors"/> Kết nối Sheet
             </button>
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-[#F8FAFC]">
        
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 py-4 px-8 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-6 flex-1">
            <div className="relative group w-96">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-hover:text-blue-500 transition-colors" size={18} />
              <input type="text" placeholder="Tìm kiếm thông minh (Tên, Mã, Tag...)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-11 pr-4 py-3 bg-slate-50/50 border-transparent hover:bg-white border hover:border-blue-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 w-full transition-all font-medium placeholder:text-slate-400" />
            </div>
            {selectedItems.size > 0 && (
               <div className="flex items-center gap-1 animate-fade-in bg-slate-900 text-white pl-4 pr-1.5 py-1.5 rounded-full shadow-lg shadow-slate-200">
                 <span className="text-xs font-bold mr-3">{selectedItems.size} đã chọn</span>
                 <button onClick={() => handleBulkAction('delete')} className="p-1.5 hover:bg-rose-500 rounded-full transition-colors" title="Xóa"><Trash2 size={14}/></button>
               </div>
            )}
          </div>
          <button onClick={() => setEditingItem({ title: '', client: '', taskName: '', stage: 'design', startDate: new Date().toISOString().split('T')[0], duration: 3, priority: 'Medium', progress: 0 })} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 hover:shadow-blue-500/40">
            <Plus size={18} strokeWidth={2.5} /> Tạo đơn mới
          </button>
        </div>

        {/* Dashboard Stats */}
        <div className="px-8 py-6 grid grid-cols-4 gap-6">
           <StatCard title="Tổng Công Việc" value={stats.total} icon={Package} color="text-indigo-600" subColor="bg-indigo-500" />
           <StatCard title="Đang Chạy" value={stats.active} icon={Activity} color="text-emerald-600" subColor="bg-emerald-500" />
           <StatCard title="Cần Gấp / Quá Hạn" value={stats.overdue} icon={AlertCircle} color="text-rose-600" subColor="bg-rose-500" />
           <StatCard title="Hoàn Thành" value={stats.completed} icon={CheckSquare} color="text-slate-600" subColor="bg-slate-500" />
        </div>

        {/* Content View */}
        <div className="flex-1 overflow-hidden px-8 pb-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
               <div className="relative">
                 <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-blue-500 animate-spin"></div>
               </div>
               <span className="font-medium text-sm">Đang đồng bộ dữ liệu...</span>
               <span className="text-xs text-slate-300">(Hãy chắc chắn bạn đã cấu hình Firebase)</span>
             </div>
          ) : (
            <>
              {view === 'list' && <ListView />}
              {view === 'board' && <BoardView />}
              {view === 'gantt' && <GanttView />}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={!!editingItem} onClose={() => setEditingItem(null)}>
        <EditForm />
      </Modal>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowImport(false)} />
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative z-10 animate-fade-in border border-slate-100">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3 text-slate-900">
              <div className="p-3 bg-green-50 rounded-2xl text-green-600 shadow-sm"><FileSpreadsheet size={28}/></div>
              Nhập từ Sheet
            </h3>
            
            <div className="bg-blue-50/50 p-5 rounded-2xl mb-6 text-sm text-blue-900 border border-blue-100/50 leading-relaxed">
               <div className="font-bold flex items-center gap-2 mb-2 text-blue-700"><AlertTriangle size={18}/> Lưu ý quan trọng:</div>
               <ul className="list-disc pl-5 space-y-1 text-blue-800/80">
                 <li>Hệ thống sẽ <strong>tự động phân tích</strong> tên công việc để gắn Tag (Gỗ, Sắt, Sơn...).</li>
                 <li>Đảm bảo file Sheet ở chế độ công khai (Anyone with link).</li>
               </ul>
            </div>

            <input 
              type="text" 
              placeholder="Dán liên kết Google Sheet vào đây..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl p-4 text-sm mb-4 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium transition-all focus:bg-white"
            />
             {importStatus && (
               <div className={`text-xs mb-4 p-3 rounded-lg font-bold text-center ${importStatus.includes('Lỗi') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                 {importStatus}
               </div>
             )}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowImport(false)} className="px-6 py-3 text-slate-500 hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors">Đóng</button>
              <button 
                onClick={handleImport} 
                disabled={isSyncing || !importUrl}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
              >
                {isSyncing && <Loader2 size={16} className="animate-spin"/>}
                {isSyncing ? 'Đang xử lý...' : 'Bắt đầu Nhập'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}