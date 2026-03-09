import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listAllFilamentsRaw, getFilamentSubstitutions, setFilamentSubstitution } from "../lib/api";
import type { FilamentInfo } from "../lib/types";
import { filamentKey } from "../lib/types";
import { onDragMouseDown } from "../hooks/useDrag";

interface FilamentManagerProps {
  onBack: () => void;
}

export default function FilamentManager({ onBack }: FilamentManagerProps) {
  const [allFilaments, setAllFilaments] = useState<FilamentInfo[]>([]);
  const [substitutions, setSubstitutions] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [filaments, subs] = await Promise.all([
        listAllFilamentsRaw(),
        getFilamentSubstitutions(),
      ]);
      setAllFilaments(filaments);
      const map = new Map<string, string>();
      for (const s of subs) {
        map.set(s.from_key, s.to_key);
      }
      setSubstitutions(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredFilaments = useMemo(() => {
    if (!search) return allFilaments;
    const q = search.toLowerCase();
    return allFilaments.filter(f =>
      f.brand.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.color.toLowerCase().includes(q)
    );
  }, [allFilaments, search]);

  async function handleSetSubstitution(fromKey: string, toKey: string | null) {
    const actualTo = toKey === "-" ? null : toKey;
    await setFilamentSubstitution(fromKey, actualTo);
    // Update local state
    setSubstitutions(prev => {
      const next = new Map(prev);
      if (actualTo) {
        next.set(fromKey, actualTo);
      } else {
        next.delete(fromKey);
      }
      return next;
    });
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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filament Management</h1>
        <span className="text-xs text-gray-400 dark:text-gray-500">{allFilaments.length} filaments</span>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search filaments..."
          className="w-full max-w-md px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {/* Filament list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Merge filaments by selecting a replacement. The original filament will be hidden from filters and replaced in project views.
          </p>

          <div className="space-y-1">
            {filteredFilaments.map((f) => {
              const key = filamentKey(f);
              const currentTarget = substitutions.get(key);
              return (
                <FilamentRow
                  key={key}
                  filament={f}
                  filamentKey={key}
                  currentTarget={currentTarget}
                  allFilaments={allFilaments}
                  onSetSubstitution={handleSetSubstitution}
                />
              );
            })}
          </div>

          {filteredFilaments.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              No filaments found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface FilamentRowProps {
  filament: FilamentInfo;
  filamentKey: string;
  currentTarget: string | undefined;
  allFilaments: FilamentInfo[];
  onSetSubstitution: (fromKey: string, toKey: string | null) => void;
}

function FilamentRow({ filament, filamentKey: fKey, currentTarget, allFilaments, onSetSubstitution }: FilamentRowProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  useEffect(() => {
    if (dropdownOpen) {
      inputRef.current?.focus();
    } else {
      setDropdownSearch("");
    }
  }, [dropdownOpen]);

  // Find the target filament info
  const targetFilament = currentTarget
    ? allFilaments.find(f => filamentKey(f) === currentTarget)
    : null;

  // Filter dropdown options (exclude self)
  const options = allFilaments.filter(f => {
    const key = filamentKey(f);
    if (key === fKey) return false;
    if (!dropdownSearch) return true;
    const q = dropdownSearch.toLowerCase();
    return f.brand.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || f.color.toLowerCase().includes(q);
  });

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      currentTarget ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
    }`}>
      {/* Source filament */}
      <div className={`flex items-center gap-2 min-w-0 w-64 shrink-0 ${currentTarget ? "opacity-60" : ""}`}>
        <div
          className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500 shrink-0"
          style={{ backgroundColor: filament.color }}
        />
        <span className={`text-sm truncate ${currentTarget ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>
          {filament.brand} {filament.name}
        </span>
        {filament.color && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono shrink-0">
            {filament.color}
          </span>
        )}
      </div>

      {/* Arrow */}
      <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>

      {/* Target dropdown */}
      <div className="relative flex-1 min-w-0" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border cursor-pointer transition-colors ${
            currentTarget
              ? "border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800"
              : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500"
          }`}
        >
          {targetFilament ? (
            <>
              <div
                className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500 shrink-0"
                style={{ backgroundColor: targetFilament.color }}
              />
              <span className="truncate text-gray-700 dark:text-gray-300">
                {targetFilament.brand} {targetFilament.name}
              </span>
            </>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">—</span>
          )}
          <svg className="w-3 h-3 text-gray-400 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-50 max-h-64 flex flex-col">
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <input
                ref={inputRef}
                type="text"
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div className="overflow-y-auto">
              {/* No substitution option */}
              <button
                onClick={() => { onSetSubstitution(fKey, null); setDropdownOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                  !currentTarget
                    ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <span>—</span>
                <span>No substitution</span>
              </button>
              {options.map((f) => {
                const key = filamentKey(f);
                const isSelected = currentTarget === key;
                return (
                  <button
                    key={key}
                    onClick={() => { onSetSubstitution(fKey, key); setDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500 shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="truncate">{f.brand} {f.name}</span>
                    {f.color && (
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">{f.color}</span>
                    )}
                  </button>
                );
              })}
              {options.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No matches</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
