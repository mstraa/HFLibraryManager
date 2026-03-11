import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listCuratedFilaments, createCuratedFilament, updateCuratedFilament, deleteCuratedFilament, importCuratedFilaments } from "../lib/api";
import type { CuratedFilament } from "../lib/types";
import { onDragMouseDown } from "../hooks/useDrag";

interface FilamentManagerProps {
  onBack: () => void;
}

export default function FilamentManager({ onBack }: FilamentManagerProps) {
  const [filaments, setFilaments] = useState<CuratedFilament[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOwned, setFilterOwned] = useState(false);
  const [filterBrand, setFilterBrand] = useState("");
  const [filterLine, setFilterLine] = useState("");
  const [filterMaterial, setFilterMaterial] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await listCuratedFilaments();
      setFilaments(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uniqueBrands = useMemo(() => [...new Set(filaments.map(f => f.brand).filter(Boolean))].sort(), [filaments]);
  const uniqueLines = useMemo(() => [...new Set(filaments.map(f => f.line).filter(Boolean))].sort(), [filaments]);
  const uniqueMaterials = useMemo(() => [...new Set(filaments.map(f => f.material).filter(Boolean))].sort(), [filaments]);

  const filtered = useMemo(() => {
    let list = filaments;
    if (filterOwned) list = list.filter(f => f.owned);
    if (filterBrand) list = list.filter(f => f.brand === filterBrand);
    if (filterLine) list = list.filter(f => f.line === filterLine);
    if (filterMaterial) list = list.filter(f => f.material === filterMaterial);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(f =>
      f.brand.toLowerCase().includes(q) ||
      f.line.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.material.toLowerCase().includes(q) ||
      f.color.toLowerCase().includes(q)
    );
  }, [filaments, search, filterOwned, filterBrand, filterLine, filterMaterial]);

  async function handleImport() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!path) return;
    const count = await importCuratedFilaments(path);
    await load();
    setToast(`Imported ${count} filaments`);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function handleToggleOwned(id: string, current: boolean) {
    await updateCuratedFilament(id, { owned: !current });
    setFilaments(prev => prev.map(f => f.id === id ? { ...f, owned: !current } : f));
  }

  async function handleDelete(id: string) {
    await deleteCuratedFilament(id);
    setFilaments(prev => prev.filter(f => f.id !== id));
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-white dark:bg-gray-900">
        <div className="text-gray-400 animate-pulse">Loading filaments...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-white dark:bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 pt-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0" onMouseDown={onDragMouseDown}>
        <button
          onClick={onBack}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filament Library</h1>
        <span className="text-xs text-gray-400 dark:text-gray-500">{filaments.length} filaments</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer transition-colors"
        >
          Add
        </button>
        <button
          onClick={handleImport}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
        >
          Import JSON
        </button>
      </div>

      {/* Search + Filters */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search filaments..."
          className="flex-1 min-w-[150px] max-w-md px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
        >
          <option value="">All brands</option>
          {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={filterLine}
          onChange={(e) => setFilterLine(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
        >
          <option value="">All lines</option>
          {uniqueLines.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          value={filterMaterial}
          onChange={(e) => setFilterMaterial(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
        >
          <option value="">All materials</option>
          {uniqueMaterials.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterOwned}
            onChange={(e) => setFilterOwned(e.target.checked)}
            className="rounded"
          />
          Owned only
        </label>
        <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} shown</span>
      </div>

      {/* Add form */}
      {showAdd && (
        <AddFilamentForm
          onAdd={async (data) => {
            await createCuratedFilament(data);
            setShowAdd(false);
            load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Brand</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Line</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Material</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">TD</th>
              <th className="text-center px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Owned</th>
              <th className="w-16 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((f) => (
              editingId === f.id ? (
                <EditFilamentRow
                  key={f.id}
                  filament={f}
                  onSave={async (updates) => {
                    await updateCuratedFilament(f.id, updates);
                    setEditingId(null);
                    load();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2">
                    <div
                      className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500"
                      style={{ backgroundColor: f.color || "#ccc" }}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{f.brand}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{f.line}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{f.material}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">{f.name}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{f.transmission_distance ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={f.owned}
                      onChange={() => handleToggleOwned(f.id, f.owned)}
                      className="rounded cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingId(f.id)}
                        className="text-gray-400 hover:text-indigo-500 cursor-pointer p-1"
                        title="Edit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        className="text-gray-400 hover:text-red-500 cursor-pointer p-1"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            No filaments found
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function AddFilamentForm({ onAdd, onCancel }: {
  onAdd: (data: { brand: string; line?: string; material?: string; name: string; color?: string; transmission_distance?: number; owned?: boolean }) => void;
  onCancel: () => void;
}) {
  const [brand, setBrand] = useState("");
  const [line, setLine] = useState("");
  const [material, setMaterial] = useState("PLA");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [td, setTd] = useState("");
  const [owned, setOwned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/10 flex items-center gap-2">
      <input ref={inputRef} value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand" className="w-24 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      <input value={line} onChange={e => setLine(e.target.value)} placeholder="Line" className="w-20 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      <input value={material} onChange={e => setMaterial(e.target.value)} placeholder="Material" className="w-16 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name *" className="w-28 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      <input value={color} onChange={e => setColor(e.target.value)} placeholder="#hex" className="w-20 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono" />
      <input value={td} onChange={e => setTd(e.target.value)} placeholder="TD" className="w-14 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono" />
      <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
        <input type="checkbox" checked={owned} onChange={e => setOwned(e.target.checked)} className="rounded" />
        Own
      </label>
      <button
        onClick={() => {
          if (!name.trim() || !brand.trim()) return;
          onAdd({ brand, line: line || undefined, material: material || undefined, name, color: color || undefined, transmission_distance: td ? parseFloat(td) : undefined, owned });
        }}
        className="text-xs px-2 py-1 rounded bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer"
      >Save</button>
      <button onClick={onCancel} className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
    </div>
  );
}

function EditFilamentRow({ filament, onSave, onCancel }: {
  filament: CuratedFilament;
  onSave: (updates: { brand?: string; line?: string; material?: string; name?: string; color?: string; transmission_distance?: number; owned?: boolean }) => void;
  onCancel: () => void;
}) {
  const [brand, setBrand] = useState(filament.brand);
  const [line, setLine] = useState(filament.line);
  const [material, setMaterial] = useState(filament.material);
  const [name, setName] = useState(filament.name);
  const [color, setColor] = useState(filament.color);
  const [td, setTd] = useState(filament.transmission_distance?.toString() ?? "");
  const [owned, setOwned] = useState(filament.owned);

  return (
    <tr className="bg-indigo-50 dark:bg-indigo-900/10">
      <td className="px-3 py-2">
        <input value={color} onChange={e => setColor(e.target.value)} className="w-16 px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono" />
      </td>
      <td className="px-3 py-2"><input value={brand} onChange={e => setBrand(e.target.value)} className="w-full px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" /></td>
      <td className="px-3 py-2"><input value={line} onChange={e => setLine(e.target.value)} className="w-full px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" /></td>
      <td className="px-3 py-2"><input value={material} onChange={e => setMaterial(e.target.value)} className="w-full px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" /></td>
      <td className="px-3 py-2"><input value={name} onChange={e => setName(e.target.value)} className="w-full px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" /></td>
      <td className="px-3 py-2"><input value={td} onChange={e => setTd(e.target.value)} className="w-14 px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono" /></td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={owned} onChange={e => setOwned(e.target.checked)} className="rounded cursor-pointer" />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => onSave({ brand, line, material, name, color, transmission_distance: td ? parseFloat(td) : undefined, owned })}
            className="text-xs px-1.5 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer"
          >Save</button>
          <button onClick={onCancel} className="text-xs px-1.5 py-0.5 text-gray-500 cursor-pointer">X</button>
        </div>
      </td>
    </tr>
  );
}
