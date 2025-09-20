use argon2::{Algorithm, Argon2, Params, Version};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::Zeroize;
use rand::Rng;

pub struct ArgonParams {
    pub mem_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

pub fn derive_kek(master: &[u8], params: &ArgonParams, salt: &[u8; 32]) -> [u8; 32] {
    let argon_params = Params::new(params.mem_kib, params.iterations, params.parallelism, Some(32)).expect("valid argon2 params");
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut out = [0u8; 32];
    argon2
        .hash_password_into(master, salt, &mut out)
        .expect("argon2 hash");
    out
}

// Returns nonce(12) || ciphertext+tag using AES-256-GCM
pub fn wrap_key_aes_gcm(kek: &[u8; 32], dek: &[u8; 32], nonce12: &[u8; 12]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(kek.into());
    let nonce = Nonce::from_slice(nonce12);
    let ct = cipher
        .encrypt(nonce, dek.as_slice())
        .expect("encryption failure");
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(nonce12);
    out.extend_from_slice(&ct);
    out
}

pub fn unwrap_key_aes_gcm(kek: &[u8; 32], ct_with_nonce: &[u8]) -> Result<[u8; 32], String> {
    if ct_with_nonce.len() < 12 + 16 {
        return Err("ciphertext too short".to_string());
    }
    let (nonce_bytes, ct) = ct_with_nonce.split_at(12);
    let cipher = Aes256Gcm::new(kek.into());
    let nonce = Nonce::from_slice(nonce_bytes);
    let mut dek = cipher
        .decrypt(nonce, ct)
        .map_err(|_| "decryption failure - wrong password or corrupted data".to_string())?;
    let mut out = [0u8; 32];
    out.copy_from_slice(&dek[..32]);
    dek.zeroize();
    Ok(out)
}

// Generic AES-GCM helpers for arbitrary plaintext
pub fn aead_encrypt_aes_gcm(key: &[u8; 32], nonce12: &[u8; 12], plaintext: &[u8], aad: &[u8]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(nonce12);
    cipher.encrypt(nonce, aes_gcm::aead::Payload { msg: plaintext, aad }).expect("encryption failure")
}

pub fn aead_decrypt_aes_gcm(key: &[u8; 32], ct: &[u8], nonce12: &[u8; 12], aad: &[u8]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(nonce12);
    cipher.decrypt(nonce, aes_gcm::aead::Payload { msg: ct, aad }).expect("decryption failure")
}

pub fn derive_item_key(dek: &[u8; 32], item_id: &[u8; 16]) -> [u8; 32] {
    const INFO_PREFIX: &[u8] = b"item";
    let mut info = Vec::with_capacity(INFO_PREFIX.len() + item_id.len());
    info.extend_from_slice(INFO_PREFIX);
    info.extend_from_slice(item_id);
    let hk = Hkdf::<Sha256>::new(Some(&[]), dek);
    let mut okm = [0u8; 32];
    hk.expand(&info, &mut okm).expect("hkdf expand");
    okm
}

// Ed25519 helpers (header signing)
use ed25519_dalek::{Signature, SigningKey, VerifyingKey};
use ed25519_dalek::Signer;

pub fn sign_header(signing_key_bytes: &[u8; 32], header_bytes: &[u8]) -> [u8; 64] {
    let signing_key = SigningKey::from_bytes(signing_key_bytes);
    let sig: Signature = signing_key.sign(header_bytes);
    sig.to_bytes()
}

pub fn verify_header(verify_key_bytes: &[u8; 32], header_bytes: &[u8], sig_bytes: &[u8; 64]) -> bool {
    let verifying_key = VerifyingKey::from_bytes(verify_key_bytes).expect("valid pubkey");
    let sig = Signature::from_bytes(sig_bytes);
    verifying_key.verify_strict(header_bytes, &sig).is_ok()
}

// Password Generator
#[derive(Debug, Clone)]
pub struct PasswordRules {
    pub length: usize,
    pub use_uppercase: bool,
    pub use_lowercase: bool,
    pub use_digits: bool,
    pub use_symbols: bool,
    pub exclude_ambiguous: bool,
    pub require_each_type: bool,
}

impl Default for PasswordRules {
    fn default() -> Self {
        Self {
            length: 16,
            use_uppercase: true,
            use_lowercase: true,
            use_digits: true,
            use_symbols: true,
            exclude_ambiguous: true,
            require_each_type: true,
        }
    }
}

impl PasswordRules {
    pub fn new(length: usize) -> Self {
        Self {
            length,
            ..Default::default()
        }
    }

    pub fn safe() -> Self {
        Self {
            length: 20,
            use_uppercase: true,
            use_lowercase: true,
            use_digits: true,
            use_symbols: true,
            exclude_ambiguous: true,
            require_each_type: true,
        }
    }

    pub fn balanced() -> Self {
        Self {
            length: 16,
            use_uppercase: true,
            use_lowercase: true,
            use_digits: true,
            use_symbols: true,
            exclude_ambiguous: false,
            require_each_type: false,
        }
    }

    pub fn fast() -> Self {
        Self {
            length: 12,
            use_uppercase: true,
            use_lowercase: true,
            use_digits: true,
            use_symbols: false,
            exclude_ambiguous: false,
            require_each_type: false,
        }
    }
}

pub fn generate_password(rules: &PasswordRules) -> String {
    let mut rng = rand::thread_rng();
    
    // Define character sets
    let mut uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let mut lowercase = "abcdefghijklmnopqrstuvwxyz";
    let mut digits = "0123456789";
    let mut symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    
    // Apply ambiguous character exclusion
    if rules.exclude_ambiguous {
        uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Remove I, O
        lowercase = "abcdefghjkmnpqrstuvwxyz"; // Remove i, l, o
        digits = "23456789"; // Remove 0, 1
        symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?"; // Keep most symbols
    }
    
    // Build character pool
    let mut charset = String::new();
    if rules.use_uppercase { charset.push_str(uppercase); }
    if rules.use_lowercase { charset.push_str(lowercase); }
    if rules.use_digits { charset.push_str(digits); }
    if rules.use_symbols { charset.push_str(symbols); }
    
    if charset.is_empty() {
        return "password".to_string();
    }
    
    let chars: Vec<char> = charset.chars().collect();
    
    // Generate password
    let mut password = String::with_capacity(rules.length);
    
    if rules.require_each_type {
        // Ensure at least one character from each required type
        if rules.use_uppercase && !uppercase.is_empty() {
            let upper_chars: Vec<char> = uppercase.chars().collect();
            password.push(upper_chars[rng.gen_range(0..upper_chars.len())]);
        }
        if rules.use_lowercase && !lowercase.is_empty() {
            let lower_chars: Vec<char> = lowercase.chars().collect();
            password.push(lower_chars[rng.gen_range(0..lower_chars.len())]);
        }
        if rules.use_digits && !digits.is_empty() {
            let digit_chars: Vec<char> = digits.chars().collect();
            password.push(digit_chars[rng.gen_range(0..digit_chars.len())]);
        }
        if rules.use_symbols && !symbols.is_empty() {
            let symbol_chars: Vec<char> = symbols.chars().collect();
            password.push(symbol_chars[rng.gen_range(0..symbol_chars.len())]);
        }
    }
    
    // Fill remaining length
    while password.len() < rules.length {
        password.push(chars[rng.gen_range(0..chars.len())]);
    }
    
    // Shuffle the password to avoid predictable patterns
    let mut password_chars: Vec<char> = password.chars().collect();
    for i in (1..password_chars.len()).rev() {
        let j = rng.gen_range(0..=i);
        password_chars.swap(i, j);
    }
    
    password_chars.into_iter().collect()
}

pub fn generate_pronounceable_password(length: usize) -> String {
    let vowels = "aeiou";
    let consonants = "bcdfghjklmnpqrstvwxyz";
    let mut rng = rand::thread_rng();
    let mut password = String::with_capacity(length);
    
    for i in 0..length {
        if i % 2 == 0 {
            // Consonant
            let cons: Vec<char> = consonants.chars().collect();
            password.push(cons[rng.gen_range(0..cons.len())]);
        } else {
            // Vowel
            let vows: Vec<char> = vowels.chars().collect();
            password.push(vows[rng.gen_range(0..vows.len())]);
        }
    }
    
    password
}
