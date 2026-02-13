use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tauri_queue::QueueManager;

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueStatusResponse {
    pub jobs: Vec<QueueJobInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueJobInfo {
    pub id: String,
    pub status: String,
}

#[tauri::command]
pub fn get_queue_status(queue: State<'_, Arc<QueueManager>>) -> Result<QueueStatusResponse, String> {
    let jobs = queue.list_jobs().map_err(|e| e.to_string())?;
    let job_infos = jobs
        .into_iter()
        .map(|(id, status)| QueueJobInfo { id, status })
        .collect();
    Ok(QueueStatusResponse { jobs: job_infos })
}

#[tauri::command]
pub fn pause_queue(_queue: State<'_, Arc<QueueManager>>) -> Result<(), String> {
    // Queue pausing will be implemented when the library supports it
    Ok(())
}

#[tauri::command]
pub fn resume_queue(_queue: State<'_, Arc<QueueManager>>) -> Result<(), String> {
    // Queue resuming will be implemented when the library supports it
    Ok(())
}

#[tauri::command]
pub fn cancel_job(job_id: String, queue: State<'_, Arc<QueueManager>>) -> Result<(), String> {
    queue.cancel(&job_id).map_err(|e| e.to_string())?;
    Ok(())
}
