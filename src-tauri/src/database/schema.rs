use rusqlite::{Connection, Result};

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            prompt TEXT,
            negative_prompt TEXT,
            checkpoint TEXT,
            sampler TEXT,
            scheduler TEXT,
            steps INTEGER,
            cfg_scale REAL,
            seed INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            favorite BOOLEAN DEFAULT FALSE,
            deleted BOOLEAN DEFAULT FALSE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS image_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            FOREIGN KEY (image_id) REFERENCES images(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS collection_images (
            collection_id TEXT NOT NULL,
            image_id TEXT NOT NULL,
            PRIMARY KEY (collection_id, image_id),
            FOREIGN KEY (collection_id) REFERENCES collections(id),
            FOREIGN KEY (image_id) REFERENCES images(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            config_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(favorite) WHERE favorite = 1",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_image_tags_image_id ON image_tags(image_id)",
        [],
    )?;

    Ok(())
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);

    if version < 1 {
        // Add rating, caption, caption_edited to images
        conn.execute_batch(
            "ALTER TABLE images ADD COLUMN rating INTEGER;
             ALTER TABLE images ADD COLUMN caption TEXT;
             ALTER TABLE images ADD COLUMN caption_edited BOOLEAN DEFAULT FALSE;",
        )?;

        // Add source and confidence to image_tags
        conn.execute_batch(
            "ALTER TABLE image_tags ADD COLUMN source TEXT DEFAULT 'ai';
             ALTER TABLE image_tags ADD COLUMN confidence REAL;",
        )?;

        conn.pragma_update(None, "user_version", &1u32)?;
    }

    if version < 2 {
        // Add inpainting support columns
        conn.execute_batch(
            "ALTER TABLE images ADD COLUMN parent_image_id TEXT REFERENCES images(id);
             ALTER TABLE images ADD COLUMN generation_type TEXT NOT NULL DEFAULT 'txt2img';",
        )
        .ok(); // .ok() because columns may already exist

        conn.pragma_update(None, "user_version", &2u32)?;
    }

    Ok(())
}
