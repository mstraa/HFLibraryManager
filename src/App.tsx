import { useEffect, useState } from "react";
import { listProjects, createProject } from "./lib/api";
import type { ProjectSummary } from "./lib/types";
import "./App.css";

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const result = await listProjects();
    setProjects(result);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createProject(newName.trim());
    setNewName("");
    await loadProjects();
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>3D Print Manager</h1>

      <form onSubmit={handleCreate} style={{ marginBottom: "2rem", display: "flex", gap: "0.5rem" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name..."
          style={{
            flex: 1, padding: "0.5rem 0.75rem",
            borderRadius: "6px", border: "1px solid #ccc",
            fontSize: "1rem",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "0.5rem 1.5rem", borderRadius: "6px",
            background: "#6366f1", color: "white", border: "none",
            fontSize: "1rem", cursor: "pointer",
          }}
        >
          Create
        </button>
      </form>

      {projects.length === 0 ? (
        <p style={{ color: "#888" }}>No projects yet. Create your first one above.</p>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "1rem",
        }}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid #e2e2e2",
                borderRadius: "8px",
                padding: "1rem",
                background: "#fafafa",
              }}
            >
              <div style={{
                width: "100%", aspectRatio: "4/3",
                background: "#e5e7eb", borderRadius: "6px",
                marginBottom: "0.75rem",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", fontSize: "2rem",
              }}>
                {p.thumbnail_path ? (
                  <img
                    src={`asset://localhost/${p.thumbnail_path}`}
                    alt={p.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "6px" }}
                  />
                ) : "🖼"}
              </div>
              <h3 style={{ margin: 0, fontSize: "0.95rem" }}>{p.name}</h3>
              <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                {p.tags.map((t) => (
                  <span key={t.id} style={{
                    fontSize: "0.7rem", padding: "0.1rem 0.4rem",
                    borderRadius: "9999px", background: t.color, color: "white",
                  }}>
                    {t.name}
                  </span>
                ))}
                {p.asset_types.map((at) => (
                  <span key={at} style={{
                    fontSize: "0.65rem", padding: "0.1rem 0.4rem",
                    borderRadius: "4px", background: "#e5e7eb", color: "#6b7280",
                  }}>
                    {at}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default App;
