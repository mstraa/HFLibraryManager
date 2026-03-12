---
sidebar_position: 10
---

# Export & Import

Share projects with others or back them up using the `.hllmproject` portable archive format.

## Exporting a Project

1. Open the project you want to export
2. Click the **more menu** (three dots) in the top-right
3. Select **Export project**
4. Choose a save location — the file is saved as `ProjectName.hllmproject`

### What Gets Exported

| Data | Included |
|------|----------|
| Files | Yes — full copies |
| File notes | Yes |
| File favorites | Yes |
| Filament assignments | Yes — including curated library data |
| Tags | Yes — names and colors |
| Collections | Yes — names and descriptions |
| Print dimensions (W/D/H) | Yes |
| Estimated print time | Yes |
| Project thumbnail | Yes |
| Project description | Yes — supports Markdown |

### Markdown in Descriptions

Project descriptions support **Markdown**, so you can write rich documentation directly inside a project. This is useful for:

- Explaining complex multi-color prints with detailed instructions
- Adding links to your website, social media, or source files
- Providing attribution and credits
- Documenting print settings or assembly steps

When you export a project, the full Markdown description travels with it — so anyone who imports it gets the complete context.

## Importing a Project

1. Click the **more menu** (three dots) in the top-right of the main view
2. Select **Import project**
3. Choose a `.hllmproject` file

The imported project is created as a new, independent project with:

- A **new unique ID** — it won't conflict with existing projects
- All **files extracted** and stored in your library
- **3MF thumbnails** automatically regenerated
- **Tags** matched by name — if a tag with the same name already exists, the project is linked to it; otherwise a new tag is created
- **Collections** handled the same way — matched by name or created if new
- **Filament data** preserved with match status and curated library references

If you currently have **tags or collections selected** in the sidebar when you import, the imported project will also be assigned to those tags and collections.

## The `.hllmproject` Format

The `.hllmproject` file is a standard **ZIP archive** containing:

```
ProjectName.hllmproject
├── manifest.json        # Project metadata, tags, collections, filaments
├── thumbnail.png        # Project cover image
├── files/
│   ├── model.3mf        # Project files
│   └── design.hfp
└── thumbnails/
    └── file_xxx.png     # Per-file thumbnails
```

The `manifest.json` uses **version 1** of the format and includes all project metadata, making it fully self-contained and portable across different libraries.

:::tip
`.hllmproject` files are just `.zip` files. You can rename one to `.zip` and unzip it to inspect or manually edit the contents.
:::
