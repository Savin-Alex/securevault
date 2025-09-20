use core_crypto::{aead_decrypt_aes_gcm, aead_encrypt_aes_gcm, derive_item_key, ArgonParams};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use uuid::Uuid;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultHeader {
    pub magic: [u8; 5],       // "SVLT1"
    pub version: u16,         // 1
    pub kdf_params: ArgonParamsOnDisk,
    pub salt_kek: [u8; 32],
    pub wrapped_dek: Vec<u8>, // nonce || ct
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArgonParamsOnDisk {
    pub mem_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl From<ArgonParams> for ArgonParamsOnDisk {
    fn from(p: ArgonParams) -> Self {
        Self { mem_kib: p.mem_kib, iterations: p.iterations, parallelism: p.parallelism }
    }
}

impl From<ArgonParamsOnDisk> for ArgonParams {
    fn from(p: ArgonParamsOnDisk) -> Self {
        ArgonParams { mem_kib: p.mem_kib, iterations: p.iterations, parallelism: p.parallelism }
    }
}

pub struct VaultStore {
    pub header: VaultHeader,
    pub path: String,
}

impl VaultStore {
    pub fn create<P: AsRef<Path>>(path: P, header: VaultHeader) -> std::io::Result<()> {
        let path_ref = path.as_ref();
        let mut f = OpenOptions::new().create_new(true).write(true).open(path_ref)?;
        let header_bytes = postcard::to_stdvec(&header).map_err(to_io_err)?;
        // Write length (u32 LE) then header
        let len = header_bytes.len() as u32;
        f.write_all(&len.to_le_bytes())?;
        f.write_all(&header_bytes)?;
        f.flush()?;
        Ok(())
    }

    pub fn open<P: AsRef<Path>>(path: P) -> std::io::Result<Self> {
        let path_ref = path.as_ref();
        let mut f = File::open(path_ref)?;
        let mut len_bytes = [0u8; 4];
        f.read_exact(&mut len_bytes)?;
        let len = u32::from_le_bytes(len_bytes) as usize;
        let mut buf = vec![0u8; len];
        f.read_exact(&mut buf)?;
        let header: VaultHeader = postcard::from_bytes(&buf).map_err(to_io_err)?;
        if header.magic != *b"SVLT1" || header.version != 1 {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid vault header"));
        }
        Ok(Self { header, path: path_ref.to_string_lossy().into_owned() })
    }

    // Append-only record write (encrypted). Format: len | id(16) | nonce(12) | ct
    pub fn write_entry(&self, dek: &[u8; 32], entry: &VaultEntry) -> std::io::Result<()> {
        let mut f = OpenOptions::new().append(true).open(&self.path)?;
        let ser = postcard::to_stdvec(entry).map_err(to_io_err)?;
        let id_bytes = entry.id.as_bytes();
        let item_key = derive_item_key(dek, &id_bytes[..16].try_into().expect("uuid slice"));
        let mut nonce = [0u8; 12];
        getrandom::getrandom(&mut nonce).map_err(to_io_err)?;
        let aad = id_bytes;
        let ct = aead_encrypt_aes_gcm(&item_key, &nonce, &ser, aad);
        let total_len = 16 + 12 + ct.len();
        let len_u32 = total_len as u32;
        f.write_all(&len_u32.to_le_bytes())?;
        f.write_all(id_bytes)?;
        f.write_all(&nonce)?;
        f.write_all(&ct)?;
        f.flush()?;
        Ok(())
    }

    pub fn read_all_entries(&self, dek: &[u8; 32]) -> std::io::Result<Vec<VaultEntry>> {
        let mut f = File::open(&self.path)?;
        // skip header
        let mut len_bytes = [0u8; 4];
        f.read_exact(&mut len_bytes)?;
        let len = u32::from_le_bytes(len_bytes) as u64;
        f.seek(SeekFrom::Start(4 + len))?;
        let mut out = Vec::new();
        loop {
            let mut lbuf = [0u8; 4];
            match f.read_exact(&mut lbuf) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(e) => return Err(e),
            }
            let clen = u32::from_le_bytes(lbuf) as usize;
            if clen < 16 + 12 + 16 { break; }
            let mut id_buf = [0u8; 16];
            f.read_exact(&mut id_buf)?;
            let mut n = [0u8; 12];
            f.read_exact(&mut n)?;
            let ct_len = clen - 16 - 12;
            let mut ct = vec![0u8; ct_len];
            f.read_exact(&mut ct)?;
            let item_key = derive_item_key(dek, &id_buf);
            let aad = &id_buf;
            let pt = aead_decrypt_aes_gcm(&item_key, &ct, &n, aad);
            let entry: VaultEntry = postcard::from_bytes(&pt).map_err(to_io_err)?;
            out.push(entry);
        }
        Ok(out)
    }

    pub fn list_entries(&self, dek: &[u8; 32]) -> std::io::Result<Vec<(Uuid, String)>> {
        let entries = self.read_all_entries(dek)?;
        Ok(entries.into_iter().map(|e| (e.id, e.title)).collect())
    }

    // Get the latest version of an entry by ID (handles updates by taking the last occurrence)
    pub fn get_entry(&self, dek: &[u8; 32], id: Uuid) -> std::io::Result<Option<VaultEntry>> {
        let entries = self.read_all_entries(dek)?;
        // Find the last occurrence of this ID (most recent version)
        Ok(entries.into_iter().rev().find(|e| e.id == id))
    }

    // Update an entry by writing a new version with the same ID
    pub fn update_entry(&self, dek: &[u8; 32], entry: VaultEntry) -> std::io::Result<()> {
        // Keep the same ID for updates
        self.write_entry(dek, &entry)
    }

    // Mark an entry as deleted by writing a special "deleted" entry
    pub fn delete_entry(&self, dek: &[u8; 32], id: Uuid) -> std::io::Result<()> {
        let deleted_entry = VaultEntry {
            id,
            title: "".to_string(),
            username: "".to_string(),
            password: "".to_string(),
        };
        self.write_entry(dek, &deleted_entry)
    }

    // Get all active (non-deleted) entries
    pub fn list_active_entries(&self, dek: &[u8; 32]) -> std::io::Result<Vec<(Uuid, String)>> {
        let entries = self.read_all_entries(dek)?;
        let mut active_entries = HashMap::new();
        
        // Process entries in order, keeping only the latest version of each ID
        for entry in entries {
            if entry.title.is_empty() && entry.username.is_empty() && entry.password.is_empty() {
                // This is a deletion marker, remove from active entries
                active_entries.remove(&entry.id);
            } else {
                // This is a regular entry, keep the latest version
                active_entries.insert(entry.id, entry.title);
            }
        }
        
        Ok(active_entries.into_iter().collect())
    }
}

fn to_io_err<E: std::error::Error + Send + Sync + 'static>(e: E) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, e)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub password: String,
}
