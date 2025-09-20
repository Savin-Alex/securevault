use core_crypto::{derive_kek, unwrap_key_aes_gcm, wrap_key_aes_gcm, ArgonParams, generate_password, PasswordRules};
use vault_store::{VaultHeader, VaultStore, ArgonParamsOnDisk};
use std::fs;
use uuid::Uuid;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Testing SecureVault core functionality...");
    
    // Test password generation
    let rules = PasswordRules::safe();
    let password = generate_password(&rules);
    println!("Generated password: {}", password);
    
    // Test vault creation
    let test_path = "/tmp/test_vault.svlt";
    let _ = fs::remove_file(test_path); // Clean up if exists
    
    let params = ArgonParams { mem_kib: 256 * 1024, iterations: 3, parallelism: 4 };
    let mut salt = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);
    let kek = derive_kek(b"test_master_password", &params, &salt);
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
    
    VaultStore::create(test_path, header)?;
    println!("✓ Vault created successfully");
    
    // Test vault opening
    let vs = VaultStore::open(test_path)?;
    println!("✓ Vault opened successfully");
    
    // Test entry creation
    let entry = vault_store::VaultEntry {
        id: Uuid::new_v4(),
        title: "Test Entry".to_string(),
        username: "test_user".to_string(),
        password: "test_password".to_string(),
    };
    
    vs.write_entry(&dek, &entry)?;
    println!("✓ Entry written successfully");
    
    // Test entry reading
    let entries = vs.read_all_entries(&dek)?;
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].title, "Test Entry");
    println!("✓ Entry read successfully");
    
    // Clean up
    fs::remove_file(test_path)?;
    println!("✓ All tests passed!");
    
    Ok(())
}
