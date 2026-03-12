---
sidebar_position: 9
---

# Templates

Save any project as a reusable template to quickly create new projects with predefined files, filament assignments, and print specifications.

## Tips for Creating Good Templates

Some apps like HueForge or Bambu Studio work best when you open or save files from a specific project folder. By creating a template with placeholder files — a dummy image, a minimal HueForge project, or a blank 3MF file — every new project created from that template will already have the right folder structure. When you open one of these files in the external app, it will default its save and export paths to that project's folder, keeping everything organized automatically.

You can create your own templates, or use ones shared by the community. The best approach is to build them yourself with your own workflow in mind — that way they match exactly how you work with your tools.

## Creating a Template

1. Open any project
2. Click the **more menu** (three dots) in the top-right
3. Select **Make as template**

The project is now marked as a template and displays an amber "Template" badge on its card in the grid view.

To remove the template status, use the same menu and select **Remove template**.

## Using a Template

When creating a new project:

1. Click **New Project** (or `Cmd/Ctrl + N`)
2. A gallery of available templates appears in the dialog
3. Select a template to use as a starting point
4. Enter a name and optional description
5. Click **Create from template**

The new project is created as an independent copy with:
- All files from the template (copied, not linked)
- Filament assignments preserved
- Print specifications (dimensions, estimated time) carried over

The new project is **not** a template itself — it's a regular project you can modify freely.

## What Gets Copied

| Data | Copied |
|------|--------|
| Files | Yes — full copies with new IDs |
| Filament assignments | Yes — mapped to the new files |
| Print dimensions (W/D/H) | Yes |
| Estimated print time | Yes |
| Tags | No |
| Collections | No |
| Notes/description | No — you provide a new one |
