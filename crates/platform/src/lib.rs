use std::time::Duration;
use tokio::time::sleep;

pub struct ClipboardManager {
    clear_timeout: Duration,
}

impl ClipboardManager {
    pub fn new(clear_timeout_seconds: u64) -> Self {
        Self {
            clear_timeout: Duration::from_secs(clear_timeout_seconds),
        }
    }

    pub async fn copy_and_clear(&self, text: &str) -> anyhow::Result<()> {
        self.copy_to_clipboard(text)?;
        let timeout = self.clear_timeout;
        tokio::spawn(async move {
            sleep(timeout).await;
            let _ = Self::clear_clipboard();
        });
        Ok(())
    }

    pub fn copy_to_clipboard(&self, text: &str) -> anyhow::Result<()> {
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            let mut cmd = Command::new("pbcopy");
            cmd.stdin(std::process::Stdio::piped());
            let mut child = cmd.spawn()?;
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                stdin.write_all(text.as_bytes())?;
            }
            child.wait()?;
        }
        
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let mut cmd = Command::new("clip");
            cmd.stdin(std::process::Stdio::piped());
            let mut child = cmd.spawn()?;
            if let Some(stdin) = child.stdin.as_mut() {
                use std::io::Write;
                stdin.write_all(text.as_bytes())?;
            }
            child.wait()?;
        }
        
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            anyhow::bail!("Clipboard not supported on this platform");
        }
        
        Ok(())
    }

    fn clear_clipboard() -> anyhow::Result<()> {
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            Command::new("pbcopy").arg("").spawn()?.wait()?;
        }
        
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            Command::new("clip").arg("").spawn()?.wait()?;
        }
        
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            anyhow::bail!("Clipboard not supported on this platform");
        }
        
        Ok(())
    }
}

#[derive(Clone)]
pub struct IdleDetector {
    timeout: Duration,
    last_activity: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

impl IdleDetector {
    pub fn new(timeout_seconds: u64) -> Self {
        Self {
            timeout: Duration::from_secs(timeout_seconds),
            last_activity: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            )),
        }
    }

    pub fn record_activity(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.last_activity.store(now, std::sync::atomic::Ordering::Relaxed);
    }

    pub async fn wait_for_idle<F>(&self, mut callback: F) -> anyhow::Result<()>
    where
        F: FnMut() + Send + 'static,
    {
        let last_activity = self.last_activity.clone();
        let timeout = self.timeout;
        
        tokio::spawn(async move {
            loop {
                sleep(Duration::from_secs(1)).await;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let last = last_activity.load(std::sync::atomic::Ordering::Relaxed);
                
                if now - last >= timeout.as_secs() {
                    callback();
                    break;
                }
            }
        });
        
        Ok(())
    }
}

pub fn store_session_token(_key: &str, _value: &[u8]) {
    // TODO: Implement secure storage for session tokens
    // This would use Keychain on macOS, DPAPI on Windows
}

// Legacy functions for compatibility
pub fn clear_clipboard_after_ms(ms: u64) {
    let _manager = ClipboardManager::new(ms / 1000);
    tokio::spawn(async move {
        sleep(Duration::from_millis(ms)).await;
        let _ = ClipboardManager::clear_clipboard();
    });
}

pub fn on_system_sleep<F: FnOnce() + Send + 'static>(f: F) {
    // TODO: Implement system sleep detection
    // This would use NSWorkspace on macOS, WM_POWERBROADCAST on Windows
    tokio::spawn(async move {
        // For now, just a placeholder
        sleep(Duration::from_secs(1)).await;
        f();
    });
}
