"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  createPlaylist,
  deletePlaylist,
  addItemToPlaylist,
  removeItemFromPlaylist,
  getLinkPreview,
  updatePlaylistItem
} from "./actions";

interface Item {
  id: string;
  source: string;
  externalId: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  embedUrl?: string;
  
  platform?: string | null;
  contentType?: string | null;
  category?: string | null;
  favicon?: string | null;
  previewTitle?: string | null;
  playlistId?: string | null;
  videoId?: string | null;
  channelName?: string | null;
}

interface PlaylistItem {
  id: string;
  playlistId: string;
  itemId: string;
  item: Item;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  items: PlaylistItem[];
}

interface DashboardProps {
  initialPlaylists: Playlist[];
  currentUser: { id: string; email: string };
}

export default function Dashboard({ initialPlaylists, currentUser }: DashboardProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null); // null means "All Content"
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [isNewPlaylistOpen, setIsNewPlaylistOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null); // For inline playing or previewing

  // Form fields
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [targetPlaylistId, setTargetPlaylistId] = useState(playlists[0]?.id || "");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");

  // Overrides and Preview fields
  const [selectedPlatform, setSelectedPlatform] = useState("website");
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);

  // Editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPlaylistId, setEditPlaylistId] = useState("");

  // Loading states
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Debounced link preview effect
  useEffect(() => {
    if (!newLinkUrl.trim()) {
      setPreviewData(null);
      setNewLinkTitle("");
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      setErrorMessage(null);
      try {
        const res = await getLinkPreview(newLinkUrl);
        if (res.success && res.metadata) {
          setPreviewData(res.metadata);
          setNewLinkTitle(res.metadata.title || "");
          if (res.metadata.platform) {
            setSelectedPlatform(res.metadata.platform);
          }
        } else {
          setPreviewData(null);
          setErrorMessage(res.error || "Preview unavailable");
        }
      } catch (err: any) {
        setPreviewData(null);
        setErrorMessage(err.message || "Preview unavailable");
      } finally {
        setIsPreviewLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [newLinkUrl]);

  // Derive active playlist
  const activePlaylist = playlists.find(p => p.id === activePlaylistId);

  // Derive items to show based on active playlist and search query
  const allPlaylistItems = activePlaylist
    ? activePlaylist.items
    : playlists.flatMap(p => p.items);

  // Deduplicate items to avoid repeating them if they are in multiple playlists when viewing "All Content"
  const uniqueItemsMap = new Map<string, { item: Item; playlistItemId: string; playlistId: string }>();
  allPlaylistItems.forEach(pi => {
    if (!uniqueItemsMap.has(pi.item.id)) {
      uniqueItemsMap.set(pi.item.id, {
        item: pi.item,
        playlistItemId: pi.id,
        playlistId: pi.playlistId
      });
    }
  });

  const displayedItems = Array.from(uniqueItemsMap.values()).filter(({ item, playlistId }) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    // Get playlist name for this item
    const playlist = playlists.find(p => p.id === playlistId);
    const playlistName = playlist ? playlist.name.toLowerCase() : "";

    const titleMatch = item.title.toLowerCase().includes(query);
    const descMatch = item.description?.toLowerCase().includes(query) || false;
    const platformMatch = item.platform?.toLowerCase().includes(query) || item.source.toLowerCase().includes(query);
    const categoryMatch = item.category?.toLowerCase().includes(query) || false;
    const playlistMatch = playlistName.includes(query);
    const channelMatch = item.channelName?.toLowerCase().includes(query) || false;
    
    // Website domain match
    let domainMatch = false;
    try {
      if (item.url.startsWith("http")) {
        const domain = new URL(item.url).hostname.toLowerCase();
        domainMatch = domain.includes(query);
      }
    } catch (_) {}

    return titleMatch || descMatch || platformMatch || categoryMatch || playlistMatch || channelMatch || domainMatch;
  });

  const [isYouTubeConnected, setIsYouTubeConnected] = useState(false);
  const [isSyncingYouTube, setIsSyncingYouTube] = useState(false);

  React.useEffect(() => {
    const checkConnection = async () => {
      const { getYouTubeConnectionStatus } = await import("./actions");
      const res = await getYouTubeConnectionStatus();
      setIsYouTubeConnected(res.connected);
    };
    checkConnection();

    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube") === "connected") {
      setSuccessMessage("Successfully linked YouTube account!");
      window.history.replaceState({}, document.title, window.location.pathname);
      checkConnection();
    } else if (params.get("youtube_error")) {
      setErrorMessage(`YouTube Link Error: ${params.get("youtube_error")}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLinkYouTube = async () => {
    setErrorMessage(null);
    const { getGoogleOAuthUrl } = await import("./actions");
    const res = await getGoogleOAuthUrl();
    if (res.success && res.url) {
      window.location.href = res.url;
    } else {
      setErrorMessage(res.error || "Failed to link YouTube account");
    }
  };

  const handleDisconnectYouTube = async () => {
    if (!confirm("Disconnect your YouTube account? Saved videos will remain in playlists.")) return;
    setErrorMessage(null);
    const { disconnectYouTube } = await import("./actions");
    const res = await disconnectYouTube();
    if (res.success) {
      setIsYouTubeConnected(false);
      setSuccessMessage("YouTube account disconnected.");
    } else {
      setErrorMessage(res.error || "Failed to disconnect YouTube account");
    }
  };

  const handleSyncYouTube = async () => {
    setIsSyncingYouTube(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { syncYouTubePlaylists } = await import("./actions");
      const res = await syncYouTubePlaylists();
      if (res.success) {
        setSuccessMessage(res.message || "YouTube playlists synced successfully!");
        window.location.reload();
      } else {
        setErrorMessage(res.error || "Failed to sync YouTube playlists");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to sync YouTube playlists");
    } finally {
      setIsSyncingYouTube(false);
    }
  };

  // Handlers
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await createPlaylist(newPlaylistName, newPlaylistDesc);
      if (res.success && res.playlist) {
        const newPl = { ...res.playlist, items: [] } as any;
        setPlaylists(prev => [newPl, ...prev]);
        setTargetPlaylistId(newPl.id);
        setNewPlaylistName("");
        setNewPlaylistDesc("");
        setIsNewPlaylistOpen(false);
        setSuccessMessage(`Playlist "${newPl.name}" created successfully!`);
      } else {
        setErrorMessage(res.error || "Failed to create playlist");
      }
    });
  };

  const handleDeletePlaylist = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the playlist "${name}"? This won't delete the saved items themselves.`)) {
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await deletePlaylist(id);
      if (res.success) {
        setPlaylists(prev => prev.filter(p => p.id !== id));
        if (activePlaylistId === id) {
          setActivePlaylistId(null);
        }
        setSuccessMessage(`Playlist "${name}" deleted.`);
      } else {
        setErrorMessage(res.error || "Failed to delete playlist");
      }
    });
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim() || !targetPlaylistId) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await addItemToPlaylist(newLinkUrl, targetPlaylistId, {
        title: newLinkTitle.trim() || undefined,
        platform: selectedPlatform || undefined,
      });
      if (res.success && res.playlistItem) {
        setPlaylists(prev => prev.map(p => {
          if (p.id === targetPlaylistId) {
            return {
              ...p,
              items: [res.playlistItem, ...p.items] as any
            };
          }
          return p;
        }));
        setNewLinkUrl("");
        setNewLinkTitle("");
        setPreviewData(null);
        setIsAddLinkOpen(false);
        setSuccessMessage("Content saved successfully!");
      } else {
        setErrorMessage(res.error || "Failed to add content link");
      }
    });
  };

  const handleRemoveItem = async (playlistItemId: string, playlistId: string, itemTitle: string) => {
    if (!confirm(`Remove "${itemTitle}" from this playlist?`)) {
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await removeItemFromPlaylist(playlistItemId);
      if (res.success) {
        setPlaylists(prev => prev.map(p => {
          if (p.id === playlistId) {
            return {
              ...p,
              items: p.items.filter(pi => pi.id !== playlistItemId)
            };
          }
          return p;
        }));
        setSuccessMessage("Item removed from playlist.");
      } else {
        setErrorMessage(res.error || "Failed to remove item");
      }
    });
  };

  const getSourceIcon = (source: string, platform?: string | null) => {
    const key = (platform || source || "").toLowerCase();
    switch (key) {
      case "youtube":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            <span>YouTube</span>
          </div>
        );
      case "netflix":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-650/10 text-red-400 border border-red-650/20">
            <span className="font-extrabold text-red-650 text-sm leading-none">N</span>
            <span>Netflix</span>
          </div>
        );
      case "instagram":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
            </svg>
            <span>Instagram</span>
          </div>
        );
      case "github":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-900 border border-slate-700 text-slate-100">
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span>GitHub</span>
          </div>
        );
      case "linkedin":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-650/10 text-blue-400 border border-blue-600/20 font-sans">
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
            <span>LinkedIn</span>
          </div>
        );
      case "twitter":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-200 border border-slate-700">
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span>Twitter/X</span>
          </div>
        );
      case "pdf":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>PDF</span>
          </div>
        );
      case "local":
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Local File</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>Website</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between backdrop-blur-xl">
        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5.5 h-5.5 text-white stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
                Homepage
              </h1>
              <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                Content Hub
              </p>
            </div>
          </div>

          {/* Quick Action Button */}
          <button
            onClick={() => setIsAddLinkOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm transition-all duration-300 shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/35 hover:-translate-y-0.5 cursor-pointer"
          >
            <svg className="w-4 h-4 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Save Content Link
          </button>

          {/* Navigation Section */}
          <nav className="flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between px-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span>Playlists & Purposes</span>
                <button
                  onClick={() => setIsNewPlaylistOpen(true)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                  title="Create Playlist"
                >
                  <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {/* All Content Tab */}
                <button
                  onClick={() => setActivePlaylistId(null)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activePlaylistId === null
                    ? "bg-indigo-600/15 text-indigo-400 border-l-2 border-indigo-500 pl-2.5"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4.5 h-4.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="7" height="9"></rect>
                      <rect x="14" y="3" width="7" height="5"></rect>
                      <rect x="14" y="12" width="7" height="9"></rect>
                      <rect x="3" y="16" width="7" height="5"></rect>
                    </svg>
                    <span>All Saved Content</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {playlists.flatMap(p => p.items).reduce((acc, current) => {
                      // Count unique items
                      return acc.includes(current.item.id) ? acc : [...acc, current.item.id];
                    }, [] as string[]).length}
                  </span>
                </button>

                {/* Playlist Tabs */}
                {playlists.map(pl => (
                  <div
                    key={pl.id}
                    className={`group flex items-center justify-between rounded-lg transition-all ${activePlaylistId === pl.id
                      ? "bg-indigo-600/15 text-indigo-400 border-l-2 border-indigo-500 pl-2.5"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                      }`}
                  >
                    <button
                      onClick={() => setActivePlaylistId(pl.id)}
                      className="flex-1 text-left px-3 py-2.5 text-sm font-medium truncate cursor-pointer"
                    >
                      {pl.name}
                    </button>
                    <div className="flex items-center pr-2 gap-1.5">
                      <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                        {pl.items.length}
                      </span>
                      <button
                        onClick={() => handleDeletePlaylist(pl.id, pl.name)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                        title="Delete Playlist"
                      >
                        <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </nav>
        </div>

        {/* User profile footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950/40">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-indigo-400">
              U
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-medium text-slate-200">Local User</span>
              <span className="text-[11px] text-slate-400 truncate">{currentUser.email}</span>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500" title="Connected"></div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Header bar */}
        <header className="h-18 border-b border-slate-800 px-8 flex items-center justify-between bg-slate-900/35 backdrop-blur-md">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-slate-100">
              {activePlaylist ? activePlaylist.name : "All Saved Content"}
            </h2>
            <p className="text-xs text-slate-400">
              {activePlaylist?.description || "Showing merged saved items from all playlists"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 fill-none stroke-current" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search across library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 bg-slate-850 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 focus:outline-none rounded-xl pl-9.5 pr-4 py-2 text-sm text-slate-200 placeholder-slate-400 transition-all duration-200 focus:w-80"
              />
            </div>
          </div>
        </header>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* Notifications */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
              <span>{errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="font-bold text-red-500 hover:text-red-400 cursor-pointer">×</button>
            </div>
          )}
          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
              <span>{successMessage}</span>
              <button onClick={() => setSuccessMessage(null)} className="font-bold text-emerald-500 hover:text-emerald-400 cursor-pointer">×</button>
            </div>
          )}

          {/* Cards Grid */}
          {displayedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mb-4 border border-slate-700">
                <svg className="w-8 h-8 stroke-current fill-none" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-300">No content found</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                {searchQuery ? "Try adjusting your search query, or clear it to see all items." : "Click 'Save Content Link' to add videos or posts to this dashboard."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayedItems.map(({ item, playlistItemId, playlistId }) => {
                const isEditing = editingItemId === item.id;
                const isPlaylist = item.contentType === "playlist";

                const handleShare = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(item.url);
                  setSuccessMessage(`Copied link: ${item.title}`);
                  setTimeout(() => setSuccessMessage(null), 3000);
                };

                const handleStartEdit = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setEditingItemId(item.id);
                  setEditTitle(item.title);
                  setEditPlaylistId(playlistId);
                };

                return (
                  <div
                    key={item.id}
                    className="group relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-indigo-500/5 flex flex-col"
                  >
                    {/* Thumbnail / Image Container */}
                    <div className="relative aspect-video w-full bg-slate-950 overflow-hidden border-b border-slate-800">
                      {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        // Platform-Specific Cover Art fallback
                        (() => {
                          switch (item.platform || item.source) {
                            case "youtube":
                            case "YOUTUBE":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-red-950/60 via-slate-900 to-red-900/40 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-red-650/10 text-red-500 border border-red-500/20 flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-red-500/80 tracking-widest uppercase font-mono">YouTube</span>
                                </div>
                              );
                            case "netflix":
                            case "NETFLIX":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-red-950/70 via-slate-955 to-red-950/30 flex flex-col items-center justify-center gap-2 select-none">
                                  <span className="font-black text-red-655 text-4xl tracking-tighter drop-shadow-md select-none">N</span>
                                  <span className="text-[10px] font-bold text-red-500/70 tracking-widest uppercase font-mono">Netflix Title</span>
                                </div>
                              );
                            case "instagram":
                            case "INSTAGRAM":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-pink-900/40 via-purple-950/60 to-yellow-950/20 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-pink-400/80 tracking-widest uppercase font-mono">Instagram</span>
                                </div>
                              );
                            case "github":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 text-slate-100 flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase font-mono">GitHub</span>
                                </div>
                              );
                            case "linkedin":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-blue-950/60 via-slate-900 to-blue-900/40 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-blue-400 tracking-widest uppercase font-mono">LinkedIn</span>
                                </div>
                              );
                            case "twitter":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-slate-700/30 text-white border border-white/10 flex items-center justify-center shadow-lg">
                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase font-mono">Twitter / X</span>
                                </div>
                              );
                            case "pdf":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-red-950/60 via-slate-900 to-red-900/40 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-red-650/10 text-red-400 border border-red-500/20 flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                      <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-red-500/80 tracking-widest uppercase font-mono">PDF File</span>
                                </div>
                              );
                            case "local":
                            case "LOCAL":
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-emerald-950/50 via-slate-900 to-emerald-950/20 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-lg">
                                    <svg className="w-5.5 h-5.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-emerald-400/80 tracking-widest uppercase font-mono">Local File</span>
                                </div>
                              );
                            default:
                              return (
                                <div className="w-full h-full bg-gradient-to-tr from-indigo-950/40 via-slate-900 to-indigo-950/20 flex flex-col items-center justify-center gap-2 select-none">
                                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shadow-lg">
                                    <svg className="w-5.5 h-5.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                                      <circle cx="12" cy="12" r="10"></circle>
                                      <line x1="2" y1="12" x2="22" y2="12"></line>
                                    </svg>
                                  </div>
                                  <span className="text-[10px] font-bold text-indigo-400/80 tracking-widest uppercase font-mono">Web Link</span>
                                </div>
                              );
                          }
                        })()
                      )}

                      {/* Source Tag Badge */}
                      <div className="absolute top-3 left-3 z-10">
                        {getSourceIcon(item.source, item.platform)}
                      </div>

                      {/* Playlist vs Video Badge */}
                      <div className="absolute top-3 right-3 z-10 flex gap-1">
                        {isPlaylist ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-purple-650/80 text-white rounded border border-purple-500/20 select-none shadow">
                            📂 Playlist
                          </span>
                        ) : item.contentType === "video" ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-red-650/80 text-white rounded border border-red-500/20 select-none shadow">
                            ▶ Video
                          </span>
                        ) : item.contentType === "pdf" ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-600/80 text-white rounded border border-amber-500/20 select-none shadow">
                            📄 PDF
                          </span>
                        ) : null}
                      </div>

                      {/* Play Button Overlay (YouTube only gets direct play, others open external) */}
                      {!isEditing && (
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 cursor-pointer"
                        >
                          <div className="w-12 h-12 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-lg shadow-black/30 transform scale-75 group-hover:scale-100 transition-all duration-300">
                            {item.source === "YOUTUBE" && !isPlaylist ? (
                              <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            ) : (
                              <svg className="w-4.5 h-4.5 stroke-current fill-none ml-0.5" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                              </svg>
                            )}
                          </div>
                        </button>
                      )}
                    </div>

                    {/* Details / Editing block */}
                    <div className="p-4 flex flex-col flex-1 gap-3 justify-between">
                      {isEditing ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!editTitle.trim() || !editPlaylistId) return;
                            setErrorMessage(null);
                            startTransition(async () => {
                              const res = await updatePlaylistItem(playlistItemId, item.id, editTitle, editPlaylistId);
                              if (res.success) {
                                setEditingItemId(null);
                                setSuccessMessage(`Updated "${editTitle}"`);
                                window.location.reload();
                              } else {
                                setErrorMessage(res.error || "Failed to update item");
                              }
                            });
                          }}
                          className="flex flex-col gap-2.5 flex-1 justify-between"
                        >
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Title</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Playlist</label>
                            <select
                              value={editPlaylistId}
                              onChange={(e) => setEditPlaylistId(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            >
                              {playlists.map(pl => (
                                <option key={pl.id} value={pl.id}>{pl.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => setEditingItemId(null)}
                              className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="text-[10px] bg-indigo-655 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded font-semibold transition cursor-pointer"
                            >
                              Save Changes
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1">
                            <h3 className="font-semibold text-slate-100 text-xs line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors" title={item.title}>
                              {item.title}
                            </h3>
                            {item.channelName && (
                              <span className="text-[10px] text-slate-400">
                                by {item.channelName}
                              </span>
                            )}
                            {item.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2 leading-normal mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2 mt-2">
                            {/* Open button behaviour */}
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
                            >
                              {isPlaylist ? "📂 Open Playlist" :
                               item.contentType === "video" || item.source === "YOUTUBE" ? "▶ Watch Video" :
                               item.platform === "instagram" ? "📸 Open Instagram" :
                               item.platform === "github" ? "💻 Open GitHub" :
                               item.platform === "linkedin" ? "👥 Open LinkedIn" :
                               item.platform === "pdf" ? "📄 View PDF" :
                               "🌐 Visit Website"}
                            </a>

                            {/* Utility Row: Share, Edit, Delete */}
                            <div className="flex items-center justify-between border-t border-slate-850 pt-2 text-[10px] text-slate-500">
                              <span>Saved {new Date(item.createdAt).toLocaleDateString()}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={handleShare}
                                  className="p-1 rounded hover:bg-slate-800 hover:text-indigo-400 transition-colors cursor-pointer"
                                  title="Copy URL to share"
                                >
                                  <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                                    <circle cx="18" cy="5" r="3"></circle>
                                    <circle cx="6" cy="12" r="3"></circle>
                                    <circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                  </svg>
                                </button>
                                <button
                                  onClick={handleStartEdit}
                                  className="p-1 rounded hover:bg-slate-800 hover:text-amber-500 transition-colors cursor-pointer"
                                  title="Edit title or playlist"
                                >
                                  <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleRemoveItem(playlistItemId, playlistId, item.title)}
                                  disabled={isPending}
                                  className="p-1 rounded hover:bg-slate-800 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Delete from playlist"
                                >
                                  <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </main>

      {/* MODAL: Save Content Link */}
      {isAddLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6.5 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100">Save Content URL</h3>
              <button
                onClick={() => {
                  setIsAddLinkOpen(false);
                  setNewLinkUrl("");
                  setNewLinkTitle("");
                  setPreviewData(null);
                  setErrorMessage(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-xl font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddLink} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paste Link / Path</label>
                <input
                  type="text"
                  required
                  placeholder="Link URL or absolute local file path (e.g. C:\movies\video.mp4)"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className="bg-slate-850 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Title Override (Optional)</label>
                <input
                  type="text"
                  placeholder={previewData?.title || "Enter custom title"}
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  className="bg-slate-850 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Platform</label>
                  <select
                    value={selectedPlatform}
                    onChange={(e) => setSelectedPlatform(e.target.value)}
                    className="bg-slate-850 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 cursor-pointer"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="instagram">Instagram</option>
                    <option value="twitter">Twitter/X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="github">GitHub</option>
                    <option value="website">Website</option>
                    <option value="article">Article</option>
                    <option value="pdf">PDF</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add to Playlist</label>
                  <select
                    value={targetPlaylistId}
                    onChange={(e) => setTargetPlaylistId(e.target.value)}
                    className="bg-slate-850 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 cursor-pointer"
                  >
                    {playlists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview Box */}
              <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-4 flex flex-col gap-3 min-h-[90px] justify-center mt-1">
                {isPreviewLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-slate-400 font-medium">Generating preview...</span>
                  </div>
                ) : previewData ? (
                  <div className="flex items-start gap-4 animate-fade-in">
                    {/* Left Thumbnail / Favicon */}
                    <div className="relative w-20 aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center shrink-0">
                      {previewData.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewData.thumbnailUrl} alt="Preview" className="object-cover w-full h-full" />
                      ) : previewData.favicon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewData.favicon} alt="Favicon" className="w-8 h-8 object-contain" />
                      ) : (
                        <svg className="w-6 h-6 stroke-slate-500 fill-none" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                        </svg>
                      )}
                    </div>
                    {/* Right Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[9px] px-1.5 py-0.5 font-bold uppercase rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                          {previewData.contentType === "playlist" ? "📂 playlist" : previewData.contentType || "link"}
                        </span>
                        {previewData.channelName && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            by {previewData.channelName}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 truncate">{previewData.title}</h4>
                      <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{previewData.description || "No description available."}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <span className="text-xs text-slate-500 font-medium">Preview unavailable</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddLinkOpen(false);
                    setNewLinkUrl("");
                    setNewLinkTitle("");
                    setPreviewData(null);
                    setErrorMessage(null);
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-xl transition text-white shadow-md shadow-indigo-650/15 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Adding..." : "Add to Library"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Playlist */}
      {isNewPlaylistOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6.5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100">Create Playlist</h3>
              <button
                onClick={() => setIsNewPlaylistOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xl font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Playlist Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Workouts, Cooking Recipes"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="bg-slate-850 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description (Optional)</label>
                <textarea
                  placeholder="What is the purpose of this collection?"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows={3}
                  className="bg-slate-850 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setIsNewPlaylistOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-xl transition text-white shadow-md shadow-indigo-650/15 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Creating..." : "Create Playlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Content Player/Previewer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">

            {/* Header bar */}
            <div className="px-6 py-4.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                {getSourceIcon(selectedItem.source)}
                <h3 className="font-bold text-slate-100 text-sm truncate max-w-xl">
                  {selectedItem.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-white text-xl font-bold cursor-pointer bg-slate-800 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-700 transition"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-5 bg-slate-950/20">
              {selectedItem.source === "YOUTUBE" && selectedItem.externalId.length === 11 ? (
                // Inline YouTube Player
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
                  <iframe
                    src={`https://www.youtube.com/embed/${selectedItem.externalId}?autoplay=1`}
                    title={selectedItem.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-none"
                  ></iframe>
                </div>
              ) : selectedItem.source === "YOUTUBE" && selectedItem.externalId.length !== 11 ? (
                // YouTube Playlist preview
                <div className="flex flex-col items-center justify-center p-10 gap-6 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <h4 className="text-lg font-bold text-white mb-1">YouTube Playlist</h4>
                    <p className="text-sm text-slate-400">This playlist can be viewed on YouTube.</p>
                  </div>
                  <a
                    href={`https://www.youtube.com/playlist?list=${selectedItem.externalId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-red-600/10"
                  >
                    Open Playlist on YouTube
                  </a>
                </div>
              ) : selectedItem.source === "LOCAL" ? (
                // Inline Local File Player
                (() => {
                  const filePath = selectedItem.externalId;
                  const isVideo = /\.(mp4|mkv|webm|ogg)$/i.test(filePath);
                  const isAudio = /\.(mp3|wav|ogg|aac|m4a)$/i.test(filePath);
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filePath);
                  const isPdf = /\.pdf$/i.test(filePath);
                  const streamUrl = `/api/local-file?path=${encodeURIComponent(filePath)}`;

                  if (isVideo) {
                    return (
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
                        <video src={streamUrl} controls autoPlay className="w-full h-full" />
                      </div>
                    );
                  }
                  if (isAudio) {
                    return (
                      <div className="w-full py-8 px-6 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center shadow-inner">
                          <svg className="w-8 h-8 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                          </svg>
                        </div>
                        <audio src={streamUrl} controls autoPlay className="w-full max-w-md" />
                      </div>
                    );
                  }
                  if (isImage) {
                    return (
                      <div className="flex items-center justify-center p-2 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={streamUrl} alt={selectedItem.title} className="max-h-[60vh] object-contain rounded-lg" />
                      </div>
                    );
                  }
                  if (isPdf) {
                    return (
                      <iframe src={streamUrl} className="w-full h-[60vh] rounded-xl border border-slate-800 bg-white" />
                    );
                  }

                  return (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-950/40 rounded-xl border border-slate-800 text-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                        <svg className="w-7 h-7 stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-200">Local File Asset</h4>
                        <p className="text-xs text-slate-500 mt-1">This format cannot be previewed inline.</p>
                      </div>
                      <a
                        href={streamUrl}
                        download={selectedItem.title}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
                      >
                        Download / Open File
                      </a>
                    </div>
                  );
                })()
              ) : (
                // Platform Preview for Netflix/Instagram/Web Link
                (() => {
                  const url = selectedItem.url;
                  const isEmbedBlocked = /youtube\.com|youtu\.be|instagram\.com|netflix\.com|twitter\.com|facebook\.com/i.test(url);

                  if (selectedItem.source === "MANUAL" && !isEmbedBlocked) {
                    return (
                      <div className="flex flex-col gap-4">
                        <iframe src={url} className="w-full h-[60vh] rounded-xl border border-slate-800 bg-white" />
                        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                          <span>Previewing webpage. If the page appears blank, it is because the website blocks iframe embeds.</span>
                          <a href={url} target="_blank" rel="noreferrer" className="text-indigo-400 font-semibold hover:text-indigo-300 flex items-center gap-1 cursor-pointer">
                            Open Link in New Tab
                            <svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                              <polyline points="15 3 21 3 21 9"></polyline>
                              <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                          </a>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                      <div className="relative aspect-video w-full md:w-1/2 rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                        {selectedItem.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedItem.thumbnailUrl}
                            alt={selectedItem.title}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          // Platform-Specific Cover Art fallback inside modal
                          (() => {
                            switch (selectedItem.source) {
                              case "YOUTUBE":
                                return (
                                  <div className="w-full h-full bg-gradient-to-tr from-red-950/60 via-slate-900 to-red-900/40 flex flex-col items-center justify-center gap-2 select-none">
                                    <div className="w-12 h-12 rounded-full bg-red-650/10 text-red-500 border border-red-500/20 flex items-center justify-center shadow-lg">
                                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                        <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                      </svg>
                                    </div>
                                    <span className="text-[10px] font-bold text-red-500/80 tracking-widest uppercase font-mono">YouTube Content</span>
                                  </div>
                                );
                              case "NETFLIX":
                                return (
                                  <div className="w-full h-full bg-gradient-to-tr from-red-950/70 via-slate-955 to-red-950/30 flex flex-col items-center justify-center gap-2 select-none">
                                    <span className="font-black text-red-650 text-4xl tracking-tighter drop-shadow-md select-none">N</span>
                                    <span className="text-[10px] font-bold text-red-550/70 tracking-widest uppercase font-mono">Netflix Title</span>
                                  </div>
                                );
                              case "INSTAGRAM":
                                return (
                                  <div className="w-full h-full bg-gradient-to-tr from-pink-900/40 via-purple-950/60 to-yellow-950/20 flex flex-col items-center justify-center gap-2 select-none">
                                    <div className="w-12 h-12 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 flex items-center justify-center shadow-lg">
                                      <svg className="w-6 h-6 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                                      </svg>
                                    </div>
                                    <span className="text-[10px] font-bold text-pink-400/80 tracking-widest uppercase font-mono">Instagram Post</span>
                                  </div>
                                );
                              default:
                                return (
                                  <div className="w-full h-full bg-gradient-to-tr from-indigo-950/40 via-slate-900 to-indigo-950/20 flex flex-col items-center justify-center gap-2 select-none">
                                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shadow-lg">
                                      <svg className="w-5.5 h-5.5 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                      </svg>
                                    </div>
                                    <span className="text-[10px] font-bold text-indigo-400/80 tracking-widest uppercase font-mono">Web Link</span>
                                  </div>
                                );
                            }
                          })()
                        )}
                      </div>
                      <div className="flex-1 flex flex-col gap-4">
                        <div>
                          <h4 className="text-lg font-bold text-white leading-snug">{selectedItem.title}</h4>
                          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                            {selectedItem.description || `This is a saved ${selectedItem.source.toLowerCase()} item. Due to third-party DRM/iframe policies, it cannot be streamed inline. Click the button below to view it directly.`}
                          </p>
                        </div>

                        <a
                          href={selectedItem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-600/10 cursor-pointer w-fit"
                        >
                          Open on {selectedItem.source === "NETFLIX" ? "Netflix" : selectedItem.source === "INSTAGRAM" ? "Instagram" : "Website"}
                          <svg className="w-4 h-4 stroke-current fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
