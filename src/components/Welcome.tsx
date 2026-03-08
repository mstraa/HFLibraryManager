import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { setupLibrary } from "../lib/api";

interface WelcomeProps {
  onComplete: () => void;
}

export default function Welcome({ onComplete }: WelcomeProps) {
  const [selecting, setSelecting] = useState(false);

  async function handleSelectFolder() {
    const selected = await open({ directory: true, multiple: false, title: "Choose your library folder" });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!path) return;

    setSelecting(true);
    try {
      await setupLibrary(path);
      onComplete();
    } catch (err) {
      console.error("Failed to set library folder:", err);
      setSelecting(false);
    }
  }

  async function handleUseDefault() {
    setSelecting(true);
    try {
      await setupLibrary();
      onComplete();
    } catch (err) {
      console.error("Failed to initialize default library:", err);
      setSelecting(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-900 text-gray-100">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="mb-8">
          <svg className="w-16 h-16 mx-auto text-indigo-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h1 className="text-2xl font-bold mb-2">Welcome to HF Library Manager</h1>
          <p className="text-gray-400 text-sm">
            Choose a folder to store your projects. This is where all your files, thumbnails, and data will be saved.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSelectFolder}
            disabled={selecting}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            {selecting ? "Setting up..." : "Choose Folder"}
          </button>

          <button
            onClick={handleUseDefault}
            disabled={selecting}
            className="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-xl text-sm text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
          >
            Use default location
          </button>

          <p className="text-xs text-gray-600 mt-4">
            You can change this later in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
