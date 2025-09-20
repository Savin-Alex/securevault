import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { Lock, Unlock, Copy, Pencil, Trash2, Plus, Search } from "lucide-react";
import "./index.css";

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
  const [path, setPath] = useState<string>(
    `${navigator.platform.includes("Mac") ? "/Users/alexander" : "C:"}/securevault/test.svlt`
  );
  const [master, setMaster] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<Array<[string, string]>>([]);
  const [newEntry, setNewEntry] = useState({ title: "", username: "", password: "" });
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(""); // 🔍 NEW

  // --- Vault auto-lock check ---
  useEffect(() => {
    if (unlocked) {
      const interval = setInterval(async () => {
        try {
          const shouldLock = await invoke<boolean>("check_auto_lock");
          if (shouldLock) {
            setUnlocked(false);
            toast({ title: "Vault locked", description: "Auto-locked due to inactivity." });
          }
        } catch {}
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [unlocked]);

  const onCreate = async () => {
    try {
      await invoke<void>("create_vault", { path, masterPassword: master });
      toast({ title: "Vault created", description: "SecureVault file is ready." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const onUnlock = async () => {
    try {
      const ok = await invoke<boolean>("unlock_vault", { path, masterPassword: master });
      if (ok) {
        setUnlocked(true);
        await loadEntries();
        toast({ title: "Vault opened", description: path.split("/").pop() });
      } else {
        toast({ title: "Failed", description: "Incorrect master password.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const loadEntries = async () => {
    try {
      const list = await invoke<Array<[string, string]>>("list_entries", {
        path,
        masterPassword: master,
      });
      setEntries(list);
    } catch (e: any) {
      toast({ title: "Error loading entries", description: String(e), variant: "destructive" });
    }
  };

  const onCreateEntry = async () => {
    try {
      await invoke<string>("create_entry", {
        path,
        masterPassword: master,
        title: newEntry.title,
        username: newEntry.username,
        password: newEntry.password,
      });
      setNewEntry({ title: "", username: "", password: "" });
      await loadEntries();
      toast({ title: "Entry created" });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const copyPassword = async (entryId: string) => {
    try {
      const entry = await invoke<Entry>("read_entry", { path, masterPassword: master, entryId });
      await invoke<void>("copy_to_clipboard", { text: entry.password });
      toast({ title: "Password copied", description: "Clears from clipboard in 30s." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const startEdit = async (id: string) => {
    try {
      const entry = await invoke<Entry>("read_entry", { path, masterPassword: master, entryId: id });
      setEditingEntry(entry);
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    try {
      await invoke<boolean>("update_entry", {
        path,
        masterPassword: master,
        ...editingEntry,
      });
      setEditingEntry(null);
      await loadEntries();
      toast({ title: "Entry updated" });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await invoke<boolean>("delete_entry", { path, masterPassword: master, id });
      setShowDeleteConfirm(null);
      await loadEntries();
      toast({ title: "Entry deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  // --- Filtered entries ---
  const filteredEntries = entries.filter(([_, title]) =>
    title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Render ---
  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" /> SecureVault
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Vault Path</label>
              <Input value={path} onChange={(e) => setPath(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Master Password</label>
              <Input type="password" value={master} onChange={(e) => setMaster(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={onCreate} variant="secondary">Create Vault</Button>
              <Button onClick={onUnlock}>Open Vault</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Unlock className="w-6 h-6 text-green-600" /> SecureVault
        </h1>
        <p className="text-gray-500 text-sm">Auto-lock: 5m • Clipboard: 30s</p>
      </header>

      {/* New entry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" /> Add Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input placeholder="Title" value={newEntry.title} onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })} />
          <Input placeholder="Username" value={newEntry.username} onChange={(e) => setNewEntry({ ...newEntry, username: e.target.value })} />
          <Input placeholder="Password" value={newEntry.password} onChange={(e) => setNewEntry({ ...newEntry, password: e.target.value })} />
          <Button onClick={onCreateEntry}>Save Entry</Button>
        </CardContent>
      </Card>

      {/* Entries list */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <CardTitle>Entries ({filteredEntries.length})</CardTitle>
          {/* 🔍 Search Bar */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-48"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredEntries.length === 0 ? (
            <p className="text-gray-500">No entries match your search.</p>
          ) : (
            filteredEntries.map(([id, title]) => (
              <div key={id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <strong>{title}</strong>
                  <span className="text-gray-500 text-xs ml-2">{id.slice(0, 6)}…</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyPassword(id)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={() => startEdit(id)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Entry</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">This action cannot be undone.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteEntry(showDeleteConfirm!)}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />)
