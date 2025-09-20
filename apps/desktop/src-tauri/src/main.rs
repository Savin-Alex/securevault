use core_crypto::{derive_kek, unwrap_key_aes_gcm, wrap_key_aes_gcm, generate_password, generate_pronounceable_password, ArgonParams, PasswordRules};
use platform::{ClipboardManager, IdleDetector};
use rand::RngCore;
use std::sync::{Arc, Mutex};
use tauri::State;
use vault_store::{ArgonParamsOnDisk, VaultEntry, VaultHeader, VaultStore};
use uuid::Uuid;

// Global state for auto-lock and clipboard management
struct AppState {
    idle_detector: Arc<Mutex<Option<IdleDetector>>>,
    clipboard_manager: Arc<Mutex<Option<ClipboardManager>>>,
    is_locked: Arc<Mutex<bool>>,
}

#[tauri::command]
fn ping() -> String { "pong".into() }

#[tauri::command]
fn create_vault(path: String, master_password: String) -> Result<(), String> {
	let params = ArgonParams { mem_kib: 256 * 1024, iterations: 3, parallelism: 4 };
	let mut salt = [0u8; 32];
	rand::thread_rng().fill_bytes(&mut salt);
	let kek = derive_kek(master_password.as_bytes(), &params, &salt);
	let mut dek = [0u8; 32];
	rand::thread_rng().fill_bytes(&mut dek);
	let mut nonce = [0u8; 12];
	rand::thread_rng().fill_bytes(&mut nonce);
	let wrapped = wrap_key_aes_gcm(&kek, &dek, &nonce);
	let header = VaultHeader {
		magic: *b"SVLT1",
		version: 1,
		kdf_params: ArgonParamsOnDisk { mem_kib: params.mem_kib, iterations: params.iterations, parallelism: params.parallelism },
		salt_kek: salt,
		wrapped_dek: wrapped,
	};
	VaultStore::create(path, header).map_err(|e| e.to_string())
}

#[tauri::command]
fn unlock_vault(
    path: String, 
    master_password: String, 
    state: State<AppState>
) -> Result<bool, String> {
    let vs = VaultStore::open(path).map_err(|e| e.to_string())?;
    let params = ArgonParams::from(vs.header.kdf_params.clone());
    let kek = derive_kek(master_password.as_bytes(), &params, &vs.header.salt_kek);
    let _dek = unwrap_key_aes_gcm(&kek, &vs.header.wrapped_dek).map_err(|e| e)?;
    
    // Set up auto-lock and clipboard management
    let idle_detector = IdleDetector::new(300); // 5 minutes
    let clipboard_manager = ClipboardManager::new(30); // 30 seconds
    
    // Update state first
    if let Ok(mut detector) = state.idle_detector.lock() {
        *detector = Some(idle_detector);
    }
    if let Ok(mut manager) = state.clipboard_manager.lock() {
        *manager = Some(clipboard_manager);
    }
    
    // Auto-lock monitoring will be handled by the frontend
    // The idle detector is set up and ready to be used
    
    if let Ok(mut locked) = state.is_locked.lock() {
        *locked = false;
    }
    
    Ok(true)
}

#[tauri::command]
fn create_entry(path: String, master_password: String, title: String, username: String, password: String) -> Result<String, String> {
	let vs = VaultStore::open(&path).map_err(|e| e.to_string())?;
	let params = ArgonParams::from(vs.header.kdf_params.clone());
	let kek = derive_kek(master_password.as_bytes(), &params, &vs.header.salt_kek);
	let dek = unwrap_key_aes_gcm(&kek, &vs.header.wrapped_dek).map_err(|e| e.to_string())?;
	
	let entry = VaultEntry {
		id: Uuid::new_v4(),
		title,
		username,
		password,
	};
	vs.write_entry(&dek, &entry).map_err(|e| e.to_string())?;
	Ok(entry.id.to_string())
}

#[tauri::command]
fn list_entries(path: String, master_password: String) -> Result<Vec<(String, String)>, String> {
	let vs = VaultStore::open(&path).map_err(|e| e.to_string())?;
	let params = ArgonParams::from(vs.header.kdf_params.clone());
	let kek = derive_kek(master_password.as_bytes(), &params, &vs.header.salt_kek);
	let dek = unwrap_key_aes_gcm(&kek, &vs.header.wrapped_dek).map_err(|e| e.to_string())?;
	
	let entries = vs.list_entries(&dek).map_err(|e| e.to_string())?;
	Ok(entries.into_iter().map(|(id, title)| (id.to_string(), title)).collect())
}

#[tauri::command]
fn read_entry(path: String, master_password: String, entry_id: String) -> Result<VaultEntry, String> {
	let vs = VaultStore::open(&path).map_err(|e| e.to_string())?;
	let params = ArgonParams::from(vs.header.kdf_params.clone());
	let kek = derive_kek(master_password.as_bytes(), &params, &vs.header.salt_kek);
	let dek = unwrap_key_aes_gcm(&kek, &vs.header.wrapped_dek).map_err(|e| e.to_string())?;
	
	let id = Uuid::parse_str(&entry_id).map_err(|e| e.to_string())?;
	vs.get_entry(&dek, id).map_err(|e| e.to_string())?.ok_or_else(|| "Entry not found".to_string())
}

#[tauri::command]
fn update_entry(
	path: String, 
	master_password: String, 
	id: String, 
	title: String, 
	username: String, 
	password: String
) -> Result<bool, String> {
	let vs = VaultStore::open(&path).map_err(|e| e.to_string())?;
	let params = ArgonParams::from(vs.header.kdf_params.clone());
	let kek = derive_kek(master_password.as_bytes(), &params, &vs.header.salt_kek);
	let dek = unwrap_key_aes_gcm(&kek, &vs.header.wrapped_dek).map_err(|e| e.to_string())?;
	let id_uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
	
	let entry = VaultEntry {
		id: id_uuid,
		title,
		username,
		password,
	};
	
	vs.update_entry(&dek, entry).map_err(|e| e.to_string())?;
	Ok(true)
}

#[tauri::command]
fn delete_entry(path: String, master_password: String, id: String) -> Result<bool, String> {
	let vs = VaultStore::open(&path).map_err(|e| e.to_string())?;
	let params = ArgonParams::from(vs.header.kdf_params.clone());
	let kek = derive_kek(master_password.as_bytes(), &params, &vs.header.salt_kek);
	let dek = unwrap_key_aes_gcm(&kek, &vs.header.wrapped_dek).map_err(|e| e.to_string())?;
	let id_uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
	
	vs.delete_entry(&dek, id_uuid).map_err(|e| e.to_string())?;
	Ok(true)
}

#[tauri::command]
fn copy_to_clipboard(text: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Ok(manager) = state.clipboard_manager.lock() {
        if let Some(clipboard) = manager.as_ref() {
            // Use the sync version for now
            clipboard.copy_to_clipboard(&text).map_err(|e| e.to_string())?;
            
            // Start auto-clear timer
            let clear_timeout = clipboard.clear_timeout;
            std::thread::spawn(move || {
                std::thread::sleep(clear_timeout);
                let _ = ClipboardManager::clear_clipboard();
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn record_activity(state: State<AppState>) -> Result<(), String> {
    if let Ok(detector) = state.idle_detector.lock() {
        if let Some(idle) = detector.as_ref() {
            idle.record_activity();
        }
    }
    Ok(())
}

#[tauri::command]
fn is_vault_locked(state: State<AppState>) -> Result<bool, String> {
    if let Ok(locked) = state.is_locked.lock() {
        Ok(*locked)
    } else {
        Ok(true)
    }
}

#[tauri::command]
fn check_auto_lock(state: State<AppState>) -> Result<bool, String> {
    if let Ok(detector) = state.idle_detector.lock() {
        if let Some(idle) = detector.as_ref() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let last = idle.last_activity.load(std::sync::atomic::Ordering::Relaxed);
            
            // Check if 5 minutes (300 seconds) have passed
            if now - last >= 300 {
                if let Ok(mut locked) = state.is_locked.lock() {
                    *locked = true;
                }
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[tauri::command]
fn generate_password_custom(
    length: usize,
    use_uppercase: bool,
    use_lowercase: bool,
    use_digits: bool,
    use_symbols: bool,
    exclude_ambiguous: bool,
    require_each_type: bool,
) -> Result<String, String> {
    let rules = PasswordRules {
        length,
        use_uppercase,
        use_lowercase,
        use_digits,
        use_symbols,
        exclude_ambiguous,
        require_each_type,
    };
    Ok(generate_password(&rules))
}

#[tauri::command]
fn generate_password_preset(preset: String) -> Result<String, String> {
    let rules = match preset.as_str() {
        "safe" => PasswordRules::safe(),
        "balanced" => PasswordRules::balanced(),
        "fast" => PasswordRules::fast(),
        _ => PasswordRules::default(),
    };
    Ok(generate_password(&rules))
}

#[tauri::command]
fn generate_pronounceable(length: usize) -> Result<String, String> {
    Ok(generate_pronounceable_password(length))
}

fn main() {
    let app_state = AppState {
        idle_detector: Arc::new(Mutex::new(None)),
        clipboard_manager: Arc::new(Mutex::new(None)),
        is_locked: Arc::new(Mutex::new(true)),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            ping, 
            create_vault, 
            unlock_vault, 
            create_entry, 
            list_entries, 
            read_entry,
            update_entry,
            delete_entry,
            copy_to_clipboard,
            record_activity,
            is_vault_locked,
            check_auto_lock,
            generate_password_custom,
            generate_password_preset,
            generate_pronounceable
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
