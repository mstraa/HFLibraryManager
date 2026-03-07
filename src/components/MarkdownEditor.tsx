import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export default function MarkdownEditor({ value, onChange, onBlur }: MarkdownEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button
          onClick={() => setMode("edit")}
          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            mode === "edit"
              ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 bg-white dark:bg-gray-900"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setMode("preview")}
          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            mode === "preview"
              ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 bg-white dark:bg-gray-900"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      {mode === "edit" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="Write your notes in Markdown..."
          className="w-full min-h-[200px] p-4 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-y focus:outline-none font-mono"
        />
      ) : (
        <div className="p-4 min-h-[200px] prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100">
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic">No notes yet. Click Edit to start writing.</p>
          )}
        </div>
      )}
    </div>
  );
}
