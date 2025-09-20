import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	// lazy import to avoid failing when not in tauri context
	const { invoke } = await import('@tauri-apps/api/core')
	return invoke<T>(cmd, args)
}

interface Entry {
	id: string
	title: string
	username: string
	password: string
}

function App() {
	const [path, setPath] = useState<string>(`${navigator.platform.includes('Mac') ? '/Users' : 'C:'}/securevault/test.svlt`)
	const [master, setMaster] = useState<string>('')
	const [status, setStatus] = useState<string>('')
	const [unlocked, setUnlocked] = useState<boolean>(false)
	const [entries, setEntries] = useState<Array<[string, string]>>([])
	const [newEntry, setNewEntry] = useState({ title: '', username: '', password: '' })
	const [editingEntry, setEditingEntry] = useState<{ id: string, title: string, username: string, password: string } | null>(null)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

	// Check if vault is locked periodically
	React.useEffect(() => {
		if (unlocked) {
			const interval = setInterval(async () => {
				try {
					const isLocked = await invoke<boolean>('is_vault_locked')
					if (isLocked) {
						setUnlocked(false)
						setStatus('Vault auto-locked due to inactivity')
					}
				} catch (e) {
					// Ignore errors for lock checking
				}
			}, 1000) // Check every second
			
			return () => clearInterval(interval)
		}
	}, [unlocked])

	const onCreate = async () => {
		try {
			setStatus('Creating vault...')
			await invoke<void>('create_vault', { path, masterPassword: master })
			setStatus('Vault created.')
		} catch (e: any) {
			setStatus(`Error: ${e}`)
		}
	}

	const onUnlock = async () => {
		try {
			setStatus('Opening vault...')
			const ok = await invoke<boolean>('unlock_vault', { path, masterPassword: master })
			if (ok) {
				setUnlocked(true)
				await loadEntries()
				setStatus('Vault opened.')
			} else {
				setStatus('Open failed')
			}
		} catch (e: any) {
			setStatus(`Error: ${e}`)
		}
	}

	const loadEntries = async () => {
		try {
			const list = await invoke<Array<[string, string]>>('list_entries', { path, masterPassword: master })
			setEntries(list)
		} catch (e: any) {
			setStatus(`Error loading entries: ${e}`)
		}
	}

	const onCreateEntry = async () => {
		try {
			await invoke<string>('create_entry', { 
				path, 
				masterPassword: master, 
				title: newEntry.title, 
				username: newEntry.username, 
				password: newEntry.password 
			})
			setNewEntry({ title: '', username: '', password: '' })
			await loadEntries()
			setStatus('Entry created.')
		} catch (e: any) {
			setStatus(`Error creating entry: ${e}`)
		}
	}

	const copyPassword = async (entryId: string) => {
		try {
			const entry = await invoke<Entry>('read_entry', { path, masterPassword: master, entryId })
			await invoke<void>('copy_to_clipboard', { text: entry.password })
			setStatus('Password copied to clipboard (will clear in 30s)')
		} catch (e: any) {
			setStatus(`Error copying password: ${e}`)
		}
	}

	const recordActivity = async () => {
		try {
			await invoke<void>('record_activity')
		} catch (e: any) {
			// Ignore errors for activity recording
		}
	}

	const generatePassword = async (preset: string) => {
		try {
			const password = await invoke<string>('generate_password_preset', { preset })
			if (editingEntry) {
				setEditingEntry({...editingEntry, password})
			} else {
				setNewEntry({...newEntry, password})
			}
			setStatus('Password generated')
		} catch (e: any) {
			setStatus(`Error generating password: ${e}`)
		}
	}

	const generateCustomPassword = async () => {
		try {
			const password = await invoke<string>('generate_password_custom', {
				length: 16,
				useUppercase: true,
				useLowercase: true,
				useDigits: true,
				useSymbols: true,
				excludeAmbiguous: true,
				requireEachType: true
			})
			if (editingEntry) {
				setEditingEntry({...editingEntry, password})
			} else {
				setNewEntry({...newEntry, password})
			}
			setStatus('Custom password generated')
		} catch (e: any) {
			setStatus(`Error generating password: ${e}`)
		}
	}

	const generatePronounceable = async () => {
		try {
			const password = await invoke<string>('generate_pronounceable', { length: 12 })
			if (editingEntry) {
				setEditingEntry({...editingEntry, password})
			} else {
				setNewEntry({...newEntry, password})
			}
			setStatus('Pronounceable password generated')
		} catch (e: any) {
			setStatus(`Error generating password: ${e}`)
		}
	}

	const startEdit = async (id: string) => {
		try {
			const entry = await invoke<Entry>('read_entry', { path, masterPassword: master, entryId: id })
			setEditingEntry({ id: entry.id, title: entry.title, username: entry.username, password: entry.password })
			setStatus('Entry loaded for editing')
		} catch (e: any) {
			setStatus(`Error loading entry: ${e}`)
		}
	}

	const saveEdit = async () => {
		if (!editingEntry) return
		try {
			await invoke<boolean>('update_entry', {
				path,
				masterPassword: master,
				id: editingEntry.id,
				title: editingEntry.title,
				username: editingEntry.username,
				password: editingEntry.password
			})
			setEditingEntry(null)
			await loadEntries()
			setStatus('Entry updated')
		} catch (e: any) {
			setStatus(`Error updating entry: ${e}`)
		}
	}

	const cancelEdit = () => {
		setEditingEntry(null)
		setStatus('Edit cancelled')
	}

	const deleteEntry = async (id: string) => {
		try {
			await invoke<boolean>('delete_entry', { path, masterPassword: master, id })
			setShowDeleteConfirm(null)
			await loadEntries()
			setStatus('Entry deleted')
		} catch (e: any) {
			setStatus(`Error deleting entry: ${e}`)
		}
	}

	if (!unlocked) {
		return (
			<div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', padding: 16, maxWidth: 640 }}>
				<h1>SecureVault</h1>
				<label style={{ display: 'block', marginTop: 12 }}>Vault Path</label>
				<input style={{ width: '100%', padding: 8 }} value={path} onChange={e => setPath(e.target.value)} />
				<label style={{ display: 'block', marginTop: 12 }}>Master Password</label>
				<input type="password" style={{ width: '100%', padding: 8 }} value={master} onChange={e => setMaster(e.target.value)} />
				<div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
					<button onClick={onCreate}>Create Vault</button>
					<button onClick={onUnlock}>Open Vault</button>
				</div>
				<p style={{ marginTop: 12, color: '#555' }}>{status}</p>
			</div>
		)
	}

	return (
		<div 
			style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', padding: 16, maxWidth: 800 }}
			onMouseMove={recordActivity}
			onKeyDown={recordActivity}
		>
			<h1>SecureVault - {path.split('/').pop()}</h1>
			<p style={{ color: '#666', fontSize: '0.9em' }}>Auto-lock: 5 minutes • Clipboard: 30s clear</p>
			
			{!editingEntry ? (
				<div style={{ marginBottom: 24 }}>
					<h3>Add New Entry</h3>
					<div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
						<input placeholder="Title" value={newEntry.title} onChange={e => setNewEntry({...newEntry, title: e.target.value})} />
						<input placeholder="Username" value={newEntry.username} onChange={e => setNewEntry({...newEntry, username: e.target.value})} />
						<div style={{ display: 'flex', gap: 4 }}>
							<input 
								placeholder="Password" 
								value={newEntry.password} 
								onChange={e => setNewEntry({...newEntry, password: e.target.value})}
								style={{ flex: 1 }}
							/>
							<button onClick={() => generatePassword('safe')} title="Safe (20 chars)">Safe</button>
							<button onClick={() => generatePassword('balanced')} title="Balanced (16 chars)">Balanced</button>
							<button onClick={() => generatePassword('fast')} title="Fast (12 chars)">Fast</button>
							<button onClick={generatePronounceable} title="Pronounceable (12 chars)">Pronounce</button>
						</div>
						<button onClick={onCreateEntry}>Add Entry</button>
					</div>
				</div>
			) : (
				<div style={{ marginBottom: 24, padding: 16, border: '2px solid #007acc', borderRadius: 8, backgroundColor: '#f0f8ff' }}>
					<h3>Edit Entry</h3>
					<div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
						<input 
							placeholder="Title" 
							value={editingEntry.title} 
							onChange={e => setEditingEntry({...editingEntry, title: e.target.value})} 
						/>
						<input 
							placeholder="Username" 
							value={editingEntry.username} 
							onChange={e => setEditingEntry({...editingEntry, username: e.target.value})} 
						/>
						<div style={{ display: 'flex', gap: 4 }}>
							<input 
								placeholder="Password" 
								value={editingEntry.password} 
								onChange={e => setEditingEntry({...editingEntry, password: e.target.value})}
								style={{ flex: 1 }}
							/>
							<button onClick={() => generatePassword('safe')} title="Safe (20 chars)">Safe</button>
							<button onClick={() => generatePassword('balanced')} title="Balanced (16 chars)">Balanced</button>
							<button onClick={() => generatePassword('fast')} title="Fast (12 chars)">Fast</button>
							<button onClick={generatePronounceable} title="Pronounceable (12 chars)">Pronounce</button>
						</div>
						<div style={{ display: 'flex', gap: 8 }}>
							<button onClick={saveEdit} style={{ backgroundColor: '#28a745', color: 'white' }}>Save Changes</button>
							<button onClick={cancelEdit} style={{ backgroundColor: '#6c757d', color: 'white' }}>Cancel</button>
						</div>
					</div>
				</div>
			)}

			<div>
				<h3>Entries ({entries.length})</h3>
				{entries.length === 0 ? (
					<p style={{ color: '#666' }}>No entries yet. Add one above.</p>
				) : (
					<div style={{ display: 'grid', gap: 8 }}>
						{entries.map(([id, title]) => (
							<div key={id} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
								<div>
									<strong>{title}</strong> <span style={{ color: '#666' }}>({id.slice(0, 8)}...)</span>
								</div>
								<div style={{ display: 'flex', gap: 4 }}>
									<button 
										onClick={() => copyPassword(id)} 
										style={{ padding: '4px 8px', fontSize: '0.8em' }}
									>
										Copy Password
									</button>
									<button 
										onClick={() => startEdit(id)} 
										style={{ padding: '4px 8px', fontSize: '0.8em', backgroundColor: '#007acc', color: 'white' }}
									>
										Edit
									</button>
									<button 
										onClick={() => setShowDeleteConfirm(id)} 
										style={{ padding: '4px 8px', fontSize: '0.8em', backgroundColor: '#dc3545', color: 'white' }}
									>
										Delete
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<p style={{ marginTop: 12, color: '#555' }}>{status}</p>

			{showDeleteConfirm && (
				<div style={{
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					zIndex: 1000
				}}>
					<div style={{
						backgroundColor: 'white',
						padding: 24,
						borderRadius: 8,
						maxWidth: 400,
						width: '90%',
						boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
					}}>
						<h3 style={{ marginTop: 0, color: '#dc3545' }}>Delete Entry</h3>
						<p>Are you sure you want to delete this entry? This action cannot be undone.</p>
						<div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
							<button 
								onClick={() => setShowDeleteConfirm(null)}
								style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: 4 }}
							>
								Cancel
							</button>
							<button 
								onClick={() => deleteEntry(showDeleteConfirm)}
								style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4 }}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
