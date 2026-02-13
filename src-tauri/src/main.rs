#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("localimage", |_ctx, request| {
            let path = request.uri().path();
            match std::fs::read(path) {
                Ok(data) => {
                    let mime = if path.ends_with(".jpg") || path.ends_with(".jpeg") {
                        "image/jpeg"
                    } else {
                        "image/png"
                    };
                    tauri::http::Response::builder()
                        .header("content-type", mime)
                        .body(data)
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize database
            stablemaster::database::initialize(&app_handle)
                .expect("Failed to initialize database");

            // Initialize queue system
            stablemaster::queue::initialize(&app_handle)
                .expect("Failed to initialize queue");

            // Load configuration
            stablemaster::config::load_or_create_default(&app_handle)
                .expect("Failed to load configuration");

            // Initialize batch AI queue
            {
                use ai_batch_queue::BatchQueue;
                use stablemaster::ai::batch_handler::AiBatchItemData;

                let queue: BatchQueue<AiBatchItemData> = BatchQueue::new();
                app.manage(queue);

                // Get config for handler
                use std::sync::Mutex;
                use stablemaster::config::settings::AppConfig;
                use tauri::Manager;

                let (endpoint, model) = {
                    let cfg = app.state::<Mutex<AppConfig>>();
                    let cfg = cfg.lock().unwrap();
                    (cfg.ollama.endpoint.clone(), cfg.ollama.vision_model.clone())
                };

                let handler = stablemaster::ai::batch_handler::AiBatchHandler {
                    app_handle: app_handle.clone(),
                    ollama_endpoint: endpoint,
                    vision_model: model,
                };

                ai_batch_queue::executor::spawn(app_handle, handler);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Configuration
            stablemaster::commands::config::get_config,
            stablemaster::commands::config::update_config,
            stablemaster::commands::config::get_mode,
            stablemaster::commands::config::set_mode,
            // Generation
            stablemaster::commands::generation::generate_image,
            stablemaster::commands::generation::queue_generation,
            stablemaster::commands::generation::cancel_generation,
            stablemaster::commands::generation::get_checkpoints,
            stablemaster::commands::generation::get_samplers,
            stablemaster::commands::generation::get_schedulers,
            // AI Enhancement
            stablemaster::commands::ai::enhance_prompt,
            stablemaster::commands::ai::batch_tag_images,
            stablemaster::commands::ai::caption_single,
            stablemaster::commands::ai::tag_single,
            stablemaster::commands::ai::get_ollama_models,
            stablemaster::commands::ai::start_batch_tag,
            stablemaster::commands::ai::start_batch_caption,
            stablemaster::commands::ai::get_batch_jobs,
            stablemaster::commands::ai::cancel_batch_job,
            // Gallery
            stablemaster::commands::gallery::get_images,
            stablemaster::commands::gallery::get_image_detail,
            stablemaster::commands::gallery::delete_image,
            stablemaster::commands::gallery::favorite_image,
            stablemaster::commands::gallery::search_images,
            stablemaster::commands::gallery::get_image_path,
            stablemaster::commands::gallery::update_image_rating,
            stablemaster::commands::gallery::update_caption,
            stablemaster::commands::gallery::get_image_tags,
            stablemaster::commands::gallery::add_image_tag,
            stablemaster::commands::gallery::remove_image_tag,
            // Queue
            stablemaster::commands::queue::get_queue_status,
            stablemaster::commands::queue::pause_queue,
            stablemaster::commands::queue::resume_queue,
            stablemaster::commands::queue::cancel_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
