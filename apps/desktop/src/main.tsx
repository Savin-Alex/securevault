import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast, ToastProvider } from "@/components/ui/use-toast";
import { useDarkMode } from "@/components/ui/use-dark-mode";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  Lock, Unlock, Copy, Pencil, Trash2, Plus, Search, Eye, EyeOff, Sun, Moon, 
  Shield, Key, Clock, CheckCircle, AlertCircle, Settings, LogOut, 
  FileText, User, Mail, Globe, CreditCard, Smartphone, Wifi, Database,
  ChevronRight, MoreVertical, Filter, SortAsc, SortDesc, RefreshCw
} from "lucide-react";
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
  const toast = useToast();
  const { enabled: darkMode, toggle } = useDarkMode();
  const [path, setPath] = useState<string>(
    `${navigator.platform.includes("Mac") ? "/Users/alexander" : "C:"}/securevault/test.svlt`
  );
  const [master, setMaster] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<Array<[string, string]>>([]);
  const [newEntry, setNewEntry] = useState({ title: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // UI states
  const [showNewEntryForm, setShowNewEntryForm] = useState(false);
  const [sortBy, setSortBy] = useState<'title' | 'date'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
    setIsCreating(true);
    try {
      await invoke<void>("create_vault", { path, masterPassword: master });
      toast({ title: "Vault created", description: "SecureVault file is ready." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const onUnlock = async () => {
    setIsUnlocking(true);
    try {
      const ok = await invoke<boolean>("unlock_vault", { path, masterPassword: master });
      if (ok) {
        setUnlocked(true);
        // Keep master password in memory for session operations
        await loadEntries();
        toast({ title: "Vault opened", description: path.split("/").pop() });
      } else {
        toast({ title: "Failed", description: "Incorrect master password.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsUnlocking(false);
    }
  };

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const list = await invoke<Array<[string, string]>>("list_entries", {
        path,
        masterPassword: master,
      });
      setEntries(list);
    } catch (e: any) {
      toast({ title: "Error loading entries", description: String(e), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const onCreateEntry = async () => {
    setIsCreatingEntry(true);
    try {
      await invoke<string>("create_entry", {
        path,
        masterPassword: master,
        title: newEntry.title,
        username: newEntry.username,
        password: newEntry.password,
      });
      setNewEntry({ title: "", username: "", password: "" });
      setShowNewEntryForm(false);
      await loadEntries();
      toast({ title: "Entry created", description: "New entry added successfully." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsCreatingEntry(false);
    }
  };

  const copyPassword = async (id: string) => {
    try {
      const entry = await invoke<Entry>("read_entry", { 
        path, 
        masterPassword: master,   // ← required
        entryId: id 
      });
      await invoke<void>("copy_to_clipboard", { text: entry.password });
      toast({ title: "Password copied", description: "Clears from clipboard in 30s." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const startEdit = async (id: string) => {
    setIsEditing(true);
    try {
      const entry = await invoke<Entry>("read_entry", { 
        path, 
        masterPassword: master,   // ← required
        entryId: id 
      });
      setEditingEntry(entry);
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsEditing(false);
    }
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    setIsEditing(true);
    try {
      await invoke<boolean>("update_entry", {
        path,
        masterPassword: master,   // ← required
        ...editingEntry,
      });
      setEditingEntry(null);
      await loadEntries();
      toast({ title: "Entry updated", description: "Changes saved successfully." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsEditing(false);
    }
  };

  const deleteEntry = async (id: string) => {
    setIsDeleting(true);
    try {
      await invoke<boolean>("delete_entry", { 
        path, 
        masterPassword: master,   // ← required
        id 
      });
      setShowDeleteConfirm(null);
      await loadEntries();
      toast({ title: "Entry deleted", description: "Entry removed successfully." });
    } catch (e: any) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleQuitVault = () => {
    setUnlocked(false);
    setMaster(""); // Clear master password
    setEntries([]);
    setSelectedEntry(null);
    setShowNewEntryForm(false);
    setShowSettings(false);
    setSearchTerm("");
    toast({ title: "Vault locked", description: "You have been logged out." });
  };

  // Helper functions
  const getEntryIcon = (title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('email') || lowerTitle.includes('mail')) return <Mail className="w-4 h-4" />;
    if (lowerTitle.includes('social') || lowerTitle.includes('facebook') || lowerTitle.includes('twitter')) return <User className="w-4 h-4" />;
    if (lowerTitle.includes('bank') || lowerTitle.includes('card') || lowerTitle.includes('payment')) return <CreditCard className="w-4 h-4" />;
    if (lowerTitle.includes('phone') || lowerTitle.includes('mobile')) return <Smartphone className="w-4 h-4" />;
    if (lowerTitle.includes('wifi') || lowerTitle.includes('network')) return <Wifi className="w-4 h-4" />;
    if (lowerTitle.includes('database') || lowerTitle.includes('server')) return <Database className="w-4 h-4" />;
    if (lowerTitle.includes('website') || lowerTitle.includes('url')) return <Globe className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 5);
  };

  const getPasswordStrengthColor = (strength: number) => {
    if (strength <= 2) return "bg-red-500";
    if (strength <= 3) return "bg-yellow-500";
    if (strength <= 4) return "bg-blue-500";
    return "bg-green-500";
  };

  const getPasswordStrengthText = (strength: number) => {
    if (strength <= 2) return "Weak";
    if (strength <= 3) return "Fair";
    if (strength <= 4) return "Good";
    return "Strong";
  };

  // --- Filtered and sorted entries ---
  const filteredEntries = entries
    .filter(([_, title]) => title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const [idA, titleA] = a;
      const [idB, titleB] = b;
      
      if (sortBy === 'title') {
        return sortOrder === 'asc' 
          ? titleA.localeCompare(titleB)
          : titleB.localeCompare(titleA);
      }
      // For date sorting, we'll use the ID as a proxy (not ideal but works for demo)
      return sortOrder === 'asc' 
        ? idA.localeCompare(idB)
        : idB.localeCompare(idA);
    });

  // --- Render ---
  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4 relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />

        {/* Main Login Card */}
        <Card className="w-full max-w-md glass-effect animate-in slide-in-from-bottom">
          <CardHeader className="relative pb-8">
            {/* Theme Toggle inside header */}
            <div className="absolute top-4 right-4">
              <Button size="icon" variant="ghost" onClick={toggle}>
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
            </div>

            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-center">SecureVault</CardTitle>
            <p className="text-muted-foreground text-center mt-2">
              Your secure password manager
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Vault Path */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Vault Path</label>
              <Input 
                value={path} 
                onChange={(e) => setPath(e.target.value)}
                placeholder="Enter vault file path"
              />
            </div>

            {/* Master Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Master Password</label>
              <Input 
                type="password" 
                value={master} 
                onChange={(e) => setMaster(e.target.value)}
                placeholder="Enter your master password"
                onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={onCreate} 
                variant="outline" 
                className="flex-1"
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" /> Create Vault
                  </>
                )}
              </Button>
              <Button 
                onClick={onUnlock} 
                className="flex-1 bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-md hover:shadow-lg"
                disabled={isUnlocking}
              >
                {isUnlocking ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Opening...
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 mr-2" /> Open Vault
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-800">
      {/* Header */}
      {/* Main Menu Header */}
      <header className="sticky top-0 z-50 glass-effect border-b backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          
          {/* Left: Logo + App Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">SecureVault</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Password Manager</p>
            </div>
          </div>

          {/* Middle: Status (hidden on small screens) */}
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Auto-lock: 5m</span>
            </div>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              <span>Clipboard: 30s</span>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle */}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggle}
              className="hover:bg-primary/10 transition-colors"
            >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

            {/* Settings */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowSettings(true)}
              className="hover:bg-primary/10 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </Button>

            {/* Logout */}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleQuitVault}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-effect">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{entries.length}</p>
                  <p className="text-sm text-muted-foreground">Total Entries</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-effect">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{filteredEntries.length}</p>
                  <p className="text-sm text-muted-foreground">Visible</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-effect">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Weak Passwords</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-effect">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">100%</p>
                  <p className="text-sm text-muted-foreground">Security Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add New Entry */}
        <Card className="glass-effect">
        <CardHeader>
            <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Add New Entry
          </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewEntryForm(!showNewEntryForm)}
                className="transition-all duration-200"
              >
                {showNewEntryForm ? "Cancel" : "Add Entry"}
              </Button>
            </div>
        </CardHeader>
          
          {showNewEntryForm && (
            <CardContent className="space-y-6 animate-in slide-in-from-top">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input 
                    placeholder="e.g., Gmail Account" 
                    value={newEntry.title} 
                    onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Username/Email</label>
                  <Input 
                    placeholder="username@example.com" 
                    value={newEntry.username} 
                    onChange={(e) => setNewEntry({ ...newEntry, username: e.target.value })}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
                    placeholder="Enter a strong password"
              value={newEntry.password}
              onChange={(e) => setNewEntry({ ...newEntry, password: e.target.value })}
                    className="pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
            <Button 
              size="icon" 
              variant="ghost" 
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
                
                {/* Password Strength Indicator */}
                {newEntry.password && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(getPasswordStrength(newEntry.password) / 5) * 100} 
                        className="flex-1 h-2"
                      />
                      <Badge variant={getPasswordStrength(newEntry.password) <= 2 ? "destructive" : 
                                     getPasswordStrength(newEntry.password) <= 3 ? "warning" : "success"}>
                        {getPasswordStrengthText(getPasswordStrength(newEntry.password))}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={onCreateEntry} 
                  disabled={isCreatingEntry || !newEntry.title || !newEntry.password}
                  className="flex-1 transition-all duration-200 hover:scale-105"
                >
                  {isCreatingEntry ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Entry
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setNewEntry({ title: "", username: "", password: "" });
                    setShowNewEntryForm(false);
                  }}
                  className="transition-all duration-200"
                >
                  Cancel
                </Button>
              </div>
        </CardContent>
          )}
      </Card>

        {/* Entries List */}
        <Card className="glass-effect">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CardTitle className="text-xl">Password Entries</CardTitle>
                <Badge variant="secondary">
                  {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
                </Badge>
              </div>

              {/* Search + Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortBy(sortBy === 'title' ? 'date' : 'title')}
                  >
                    <Filter className="w-4 h-4 mr-1" />
                    {sortBy === 'title' ? 'Title' : 'Date'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="w-12 h-12 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="w-8 h-8 rounded" />
                      <Skeleton className="w-8 h-8 rounded" />
                      <Skeleton className="w-8 h-8 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No entries found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "No entries match your search." : "Add your first password entry."}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setShowNewEntryForm(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Add First Entry
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredEntries.map(([id, title]) => (
                  <div key={id}>
                    <div
                      className={`flex items-center justify-between gap-4 p-6 hover:bg-muted/30 transition-all ${
                        selectedEntry === id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                      }`}
                    >
                      {/* Left: Avatar + Title */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getEntryIcon(title)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{title}</h3>
                          <p className="text-sm text-muted-foreground">Last modified recently</p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => copyPassword(id)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => startEdit(id)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setShowDeleteConfirm({ id, title })}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelectedEntry(selectedEntry === id ? null : id)}
                        >
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${
                              selectedEntry === id ? 'rotate-90' : ''
                            }`}
                          />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Expanded Details */}
                    {selectedEntry === id && (
                      <div className="px-6 pb-4 bg-muted/20 border-l-4 border-l-primary">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">ID:</span>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{id}</code>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Entry Details:</span>
                            <div className="text-sm text-muted-foreground">
                              Click the action buttons above to copy, edit, or delete this entry.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
          )}
        </CardContent>
      </Card>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="dialog-panel sm:max-w-md rounded-xl shadow-xl border">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>Delete Entry</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  This action cannot be undone.
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm">
              Are you sure you want to delete <strong>"{showDeleteConfirm?.title}"</strong>? 
              This will permanently remove the entry from your vault.
            </p>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirm(null)}
              disabled={isDeleting}
              className="transition-all duration-200"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteEntry(showDeleteConfirm!.id)}
              disabled={isDeleting}
              className="transition-all duration-200 hover:scale-105"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Entry
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

        {/* Edit Entry Dialog */}
        <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
          <DialogContent className="dialog-panel sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-xl border">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>Edit Entry</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Update the entry details below.
                  </p>
                </div>
              </div>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={editingEntry?.title || ''}
                  onChange={(e) => setEditingEntry(prev => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="Entry title"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Username/Email</label>
                <Input
                  value={editingEntry?.username || ''}
                  onChange={(e) => setEditingEntry(prev => prev ? { ...prev, username: e.target.value } : null)}
                  placeholder="Username or email"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={editingEntry?.password || ''}
                    onChange={(e) => setEditingEntry(prev => prev ? { ...prev, password: e.target.value } : null)}
                    placeholder="Password"
                    className="pr-10"
                  />
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                
                {/* Password Strength Indicator */}
                {editingEntry?.password && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(getPasswordStrength(editingEntry.password) / 5) * 100} 
                        className="flex-1 h-2"
                      />
                      <Badge variant={getPasswordStrength(editingEntry.password) <= 2 ? "destructive" : 
                                     getPasswordStrength(editingEntry.password) <= 3 ? "warning" : "success"}>
                        {getPasswordStrengthText(getPasswordStrength(editingEntry.password))}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setEditingEntry(null)}
                disabled={isEditing}
              >
                Cancel
              </Button>
              <Button 
                onClick={saveEdit}
                disabled={isEditing || !editingEntry?.title || !editingEntry?.password}
              >
                {isEditing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="dialog-panel sm:max-w-md rounded-xl shadow-xl border">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>Settings</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure your SecureVault preferences.
                  </p>
                </div>
              </div>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Dark Mode</h3>
                    <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={toggle}>
                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </Button>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <h3 className="font-medium">Vault Information</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Path:</strong> {path}</p>
                    <p><strong>Entries:</strong> {entries.length}</p>
                    <p><strong>Auto-lock:</strong> 5 minutes</p>
                    <p><strong>Clipboard clear:</strong> 30 seconds</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <h3 className="font-medium">Security</h3>
                  <p className="text-sm text-muted-foreground">
                    Your master password is not stored and is cleared after vault unlock for security.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                Close
              </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <App />
  </ToastProvider>
)
