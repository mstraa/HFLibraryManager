use image::imageops::FilterType;
use image::GenericImageView;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

const THUMB_MAX_WIDTH: u32 = 400;
const THUMB_MAX_HEIGHT: u32 = 300;

/// Extract thumbnail from a .3mf file (ZIP archive).
/// BambuLab Studio and most slicers embed a thumbnail at known paths.
pub fn extract_3mf_thumbnail(file_path: &Path) -> Option<Vec<u8>> {
    let file = fs::File::open(file_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;

    // Common thumbnail paths in 3MF files
    let thumb_paths = [
        "Metadata/plate_1.png",
        "Metadata/thumbnail.png",
        "Metadata/plate_2.png",
        "Metadata/top.png",
        "Metadata/pick.png",
        "thumbnail/thumbnail.png",
        "3D/Thumbnail.png",
        "_rels/.rels", // fallback: we'll skip this one
    ];

    for path in &thumb_paths {
        if *path == "_rels/.rels" {
            continue;
        }
        if let Ok(mut entry) = archive.by_name(path) {
            let mut buf = Vec::new();
            if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                // Verify it's actually an image
                if image::guess_format(&buf).is_ok() {
                    return Some(buf);
                }
            }
        }
    }

    // Fallback: search for any PNG/JPG in the archive
    for i in 0..archive.len() {
        if let Ok(mut entry) = archive.by_index(i) {
            let name = entry.name().to_lowercase();
            if (name.ends_with(".png") || name.ends_with(".jpg") || name.ends_with(".jpeg"))
                && (name.contains("thumb") || name.contains("plate") || name.contains("pick"))
            {
                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                    return Some(buf);
                }
            }
        }
    }

    None
}

/// Resize image bytes to thumbnail size and save as PNG.
/// Returns the path to the saved thumbnail.
pub fn generate_thumbnail(image_bytes: &[u8], dest_dir: &Path, filename: &str) -> Option<PathBuf> {
    let img = image::load_from_memory(image_bytes).ok()?;
    let (w, h) = img.dimensions();

    let thumb = if w > THUMB_MAX_WIDTH || h > THUMB_MAX_HEIGHT {
        if w > THUMB_MAX_WIDTH * 4 || h > THUMB_MAX_HEIGHT * 4 {
            let pre = img.resize(THUMB_MAX_WIDTH * 2, THUMB_MAX_HEIGHT * 2, FilterType::Nearest);
            pre.resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, FilterType::Lanczos3)
        } else {
            img.resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, FilterType::Lanczos3)
        }
    } else {
        img
    };

    fs::create_dir_all(dest_dir).ok()?;
    let dest_path = dest_dir.join(filename);
    thumb.save(&dest_path).ok()?;

    Some(dest_path)
}

/// Generate a thumbnail from an image file on disk (for manual thumbnail setting).
/// Copies and resizes to standard thumbnail dimensions.
/// Uses a fast two-pass resize for large images to avoid blocking.
pub fn generate_thumbnail_from_file(source_path: &Path, dest_dir: &Path, filename: &str) -> Option<PathBuf> {
    // Read bytes and detect format from content, not extension (handles mismatched extensions)
    let bytes = fs::read(source_path).ok()?;
    let img = image::load_from_memory(&bytes).ok()?;
    let (w, h) = img.dimensions();

    let thumb = if w > THUMB_MAX_WIDTH || h > THUMB_MAX_HEIGHT {
        // For large images, do a fast pre-shrink then a quality pass
        if w > THUMB_MAX_WIDTH * 4 || h > THUMB_MAX_HEIGHT * 4 {
            let pre = img.resize(THUMB_MAX_WIDTH * 2, THUMB_MAX_HEIGHT * 2, FilterType::Nearest);
            pre.resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, FilterType::Lanczos3)
        } else {
            img.resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, FilterType::Lanczos3)
        }
    } else {
        img
    };

    fs::create_dir_all(dest_dir).ok()?;
    let dest_path = dest_dir.join(filename);
    thumb.save(&dest_path).ok()?;

    Some(dest_path)
}
