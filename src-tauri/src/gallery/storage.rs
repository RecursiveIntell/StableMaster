use crate::database::models::{ImageRecord, ImageTag};
use crate::database::Database;
use anyhow::Result;
use rusqlite::params;

pub fn save_image_record(db: &Database, record: &ImageRecord) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO images (id, filename, width, height, prompt, negative_prompt, \
         checkpoint, sampler, scheduler, steps, cfg_scale, seed, favorite, rating, caption, \
         caption_edited, parent_image_id, generation_type) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            record.id,
            record.filename,
            record.width,
            record.height,
            record.prompt,
            record.negative_prompt,
            record.checkpoint,
            record.sampler,
            record.scheduler,
            record.steps,
            record.cfg_scale,
            record.seed,
            record.favorite,
            record.rating,
            record.caption,
            record.caption_edited,
            record.parent_image_id,
            record.generation_type,
        ],
    )?;
    Ok(())
}

const IMAGE_SELECT_COLS: &str = "id, filename, width, height, prompt, negative_prompt, \
     checkpoint, sampler, scheduler, steps, cfg_scale, seed, created_at, favorite, \
     rating, caption, caption_edited, parent_image_id, generation_type";

fn row_to_image(row: &rusqlite::Row) -> rusqlite::Result<ImageRecord> {
    Ok(ImageRecord {
        id: row.get(0)?,
        filename: row.get(1)?,
        width: row.get(2)?,
        height: row.get(3)?,
        prompt: row.get(4)?,
        negative_prompt: row.get(5)?,
        checkpoint: row.get(6)?,
        sampler: row.get(7)?,
        scheduler: row.get(8)?,
        steps: row.get(9)?,
        cfg_scale: row.get(10)?,
        seed: row.get(11)?,
        created_at: row.get(12)?,
        favorite: row.get(13)?,
        rating: row.get(14)?,
        caption: row.get(15)?,
        caption_edited: row.get::<_, Option<bool>>(16)?.unwrap_or(false),
        parent_image_id: row.get(17)?,
        generation_type: row.get::<_, Option<String>>(18)?.unwrap_or_else(|| "txt2img".to_string()),
    })
}

pub fn get_images(
    db: &Database,
    limit: u32,
    offset: u32,
    favorites_only: bool,
) -> Result<Vec<ImageRecord>> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;

    let query = if favorites_only {
        format!(
            "SELECT {} FROM images WHERE deleted = 0 AND favorite = 1 \
             ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
            IMAGE_SELECT_COLS
        )
    } else {
        format!(
            "SELECT {} FROM images WHERE deleted = 0 \
             ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
            IMAGE_SELECT_COLS
        )
    };

    let mut stmt = conn.prepare(&query)?;
    let rows = stmt.query_map(params![limit, offset], |row| row_to_image(row))?;

    let mut images = Vec::new();
    for row in rows {
        images.push(row?);
    }
    Ok(images)
}

pub fn get_image_detail(db: &Database, image_id: &str) -> Result<Option<ImageRecord>> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;

    let query = format!(
        "SELECT {} FROM images WHERE id = ?1 AND deleted = 0",
        IMAGE_SELECT_COLS
    );

    let mut stmt = conn.prepare(&query)?;
    let mut rows = stmt.query(params![image_id])?;

    if let Some(row) = rows.next()? {
        Ok(Some(row_to_image(row)?))
    } else {
        Ok(None)
    }
}

pub fn search_images(db: &Database, query: &str) -> Result<Vec<ImageRecord>> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;

    let pattern = format!("%{}%", query);
    let sql = format!(
        "SELECT {} FROM images WHERE deleted = 0 AND (prompt LIKE ?1 OR negative_prompt LIKE ?1) \
         ORDER BY created_at DESC LIMIT 100",
        IMAGE_SELECT_COLS
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![pattern], |row| row_to_image(row))?;

    let mut images = Vec::new();
    for row in rows {
        images.push(row?);
    }
    Ok(images)
}

pub fn toggle_favorite(db: &Database, image_id: &str) -> Result<bool> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE images SET favorite = NOT favorite WHERE id = ?1",
        params![image_id],
    )?;

    let fav: bool = conn.query_row(
        "SELECT favorite FROM images WHERE id = ?1",
        params![image_id],
        |row| row.get(0),
    )?;
    Ok(fav)
}

pub fn soft_delete_image(db: &Database, image_id: &str) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE images SET deleted = 1 WHERE id = ?1",
        params![image_id],
    )?;
    Ok(())
}

pub fn update_rating(db: &Database, image_id: &str, rating: Option<u32>) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE images SET rating = ?1 WHERE id = ?2",
        params![rating, image_id],
    )?;
    Ok(())
}

pub fn update_caption(db: &Database, image_id: &str, caption: &str, edited: bool) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "UPDATE images SET caption = ?1, caption_edited = ?2 WHERE id = ?3",
        params![caption, edited, image_id],
    )?;
    Ok(())
}

// --- Tag functions ---

pub fn save_tags(db: &Database, image_id: &str, tags: &[String]) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    for tag in tags {
        conn.execute(
            "INSERT INTO image_tags (image_id, tag, source) VALUES (?1, ?2, 'ai')",
            params![image_id, tag],
        )?;
    }
    Ok(())
}

pub fn save_tags_with_source(
    db: &Database,
    image_id: &str,
    tags: &[String],
    source: &str,
    confidence: Option<f64>,
) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    for tag in tags {
        conn.execute(
            "INSERT INTO image_tags (image_id, tag, source, confidence) VALUES (?1, ?2, ?3, ?4)",
            params![image_id, tag, source, confidence],
        )?;
    }
    Ok(())
}

pub fn get_tags(db: &Database, image_id: &str) -> Result<Vec<ImageTag>> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    let mut stmt = conn.prepare(
        "SELECT id, image_id, tag, COALESCE(source, 'ai') as source, confidence \
         FROM image_tags WHERE image_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![image_id], |row| {
        Ok(ImageTag {
            id: row.get(0)?,
            image_id: row.get(1)?,
            tag: row.get(2)?,
            source: row.get(3)?,
            confidence: row.get(4)?,
        })
    })?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

pub fn add_single_tag(db: &Database, image_id: &str, tag: &str, source: &str) -> Result<ImageTag> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO image_tags (image_id, tag, source) VALUES (?1, ?2, ?3)",
        params![image_id, tag, source],
    )?;
    let id = conn.last_insert_rowid();
    Ok(ImageTag {
        id,
        image_id: image_id.to_string(),
        tag: tag.to_string(),
        source: source.to_string(),
        confidence: None,
    })
}

pub fn delete_tag(db: &Database, tag_id: i64) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute("DELETE FROM image_tags WHERE id = ?1", params![tag_id])?;
    Ok(())
}

pub fn clear_ai_tags(db: &Database, image_id: &str) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "DELETE FROM image_tags WHERE image_id = ?1 AND (source = 'ai' OR source IS NULL)",
        params![image_id],
    )?;
    Ok(())
}
