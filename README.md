# SecureVault

A secure, cross-platform password manager built with Rust and Tauri.

## Features

- 🔐 **Secure Storage**: AES-256-GCM encryption with Argon2 key derivation
- 🖥️ **Cross-Platform**: Native desktop app for macOS, Windows, and Linux
- 🔒 **Auto-Lock**: Automatically locks after 5 minutes of inactivity
- 📋 **Smart Clipboard**: Auto-clears copied passwords after 30 seconds
- 🎲 **Password Generator**: Multiple presets (Safe, Balanced, Fast, Pronounceable)
- ✏️ **Full CRUD**: Create, read, update, and delete password entries
- 🏗️ **Modern Architecture**: Rust backend with React frontend

## Architecture

```
SecureVault/
├── crates/
│   ├── core-crypto/     # Cryptographic primitives
│   ├── vault-store/     # Encrypted vault storage
│   └── platform/        # Platform-specific features
└── apps/
    └── desktop/         # Tauri desktop application
```

## Security Features

- **Encryption**: AES-256-GCM for data encryption
- **Key Derivation**: Argon2id with configurable parameters
- **Auto-Lock**: Vault locks automatically after inactivity
- **Clipboard Security**: Passwords auto-clear from clipboard
- **Memory Safety**: Rust's memory safety guarantees

## Prerequisites

- Rust (via rustup)
- Node.js 18+
- pnpm 9+ (preferred)

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/securevault.git
   cd securevault
   ```

2. **Install dependencies**:
   ```bash
   # Install Rust dependencies
   cargo build
   
   # Install frontend dependencies
   cd apps/desktop
   npm install
   ```

3. **Run in development mode**:
   ```bash
   cd apps/desktop
   npm run dev
   ```

## Building

### Desktop App
```bash
cd apps/desktop
npm run tauri build
```

### Rust Components Only
```bash
cargo build --release
```

## Usage

1. **Create a new vault**:
   - Enter a vault file path (e.g., `/Users/username/my-vault.svlt`)
   - Set a strong master password
   - Click "Create Vault"

2. **Add password entries**:
   - Click "Add Entry" to create new entries
   - Use the password generator for secure passwords
   - Choose from presets: Safe (20 chars), Balanced (16 chars), Fast (12 chars), or Pronounceable

3. **Manage entries**:
   - Edit existing entries
   - Copy passwords to clipboard (auto-clears in 30 seconds)
   - Delete entries when no longer needed

## Security Considerations

- **Master Password**: Choose a strong, unique master password
- **Vault Location**: Store vault files in a secure location
- **Backup**: Regularly backup your vault files
- **Auto-Lock**: The vault will auto-lock after 5 minutes of inactivity

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
