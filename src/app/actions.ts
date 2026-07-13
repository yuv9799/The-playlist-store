"use server";

import { prisma } from "../lib/db";
import { getCurrentUser } from "../lib/auth";
import { parseUrl } from "../lib/parser";
import { revalidatePath } from "next/cache";

function isValidUrl(urlStr: string): boolean {
  const isLocalFile = urlStr.startsWith("file://") ||
    /^[a-zA-Z]:\\/i.test(urlStr) ||
    /^[a-zA-Z]:\//i.test(urlStr) ||
    (urlStr.startsWith("/") && !urlStr.startsWith("//") && !urlStr.includes(":") && !urlStr.includes(".com"));
    
  if (isLocalFile) return true;

  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function repairItems(userId: string) {
  try {
    const items = await prisma.item.findMany({
      where: {
        userId,
      }
    });

    for (const item of items) {
      let cleanUrl = item.url.trim();
      if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
        cleanUrl = cleanUrl.substring(1, cleanUrl.length - 1).trim();
      }

      // Check if item needs repair (missing new platform/contentType metadata)
      const needsRepair = !item.platform || !item.contentType;
      
      if (needsRepair) {
        try {
          const metadata = await parseUrl(cleanUrl);
          await prisma.item.update({
            where: { id: item.id },
            data: {
              source: metadata.source,
              externalId: metadata.externalId,
              title: item.title === "Web Page" ? metadata.title : item.title,
              description: item.description || metadata.description,
              url: metadata.url || item.url,
              thumbnailUrl: item.thumbnailUrl || metadata.thumbnailUrl,
              platform: metadata.platform,
              contentType: metadata.contentType,
              favicon: metadata.favicon,
              previewTitle: metadata.previewTitle,
              playlistId: metadata.playlistId,
              videoId: metadata.videoId,
              channelName: metadata.channelName,
            }
          });
        } catch (err) {
          console.error(`Failed to repair item ${item.id}:`, err);
        }
      }
    }
  } catch (e) {
    console.error("Error repairing items:", e);
  }
}

export async function getLinkPreview(url: string) {
  try {
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
      cleanUrl = cleanUrl.substring(1, cleanUrl.length - 1).trim();
    }
    
    if (!isValidUrl(cleanUrl)) {
      return { success: false, error: "Invalid URL or path. Please enter a valid URL (https://...) or absolute local path." };
    }

    const metadata = await parseUrl(cleanUrl);
    return { success: true, metadata };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to parse link." };
  }
}

export async function getPlaylists() {
  try {
    const user = await getCurrentUser();

    // Repair any misclassified items
    await repairItems(user.id);

    const playlists = await prisma.playlist.findMany({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, playlists };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch playlists" };
  }
}

export async function getPlaylistWithItems(playlistId: string) {
  try {
    const user = await getCurrentUser();
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, userId: user.id },
      include: {
        items: {
          include: {
            item: true,
          },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!playlist) {
      return { success: false, error: "Playlist not found" };
    }

    return { success: true, playlist };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch playlist items" };
  }
}

export async function createPlaylist(name: string, description?: string) {
  try {
    const user = await getCurrentUser();
    if (!name.trim()) {
      return { success: false, error: "Playlist name is required" };
    }

    const playlist = await prisma.playlist.create({
      data: {
        name,
        description,
        userId: user.id,
      },
    });

    revalidatePath("/");
    return { success: true, playlist };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create playlist" };
  }
}

export async function deletePlaylist(playlistId: string) {
  try {
    const user = await getCurrentUser();

    // Ensure the playlist belongs to the user
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, userId: user.id },
    });

    if (!playlist) {
      return { success: false, error: "Playlist not found or access denied" };
    }

    await prisma.playlist.delete({
      where: { id: playlistId },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to delete playlist" };
  }
}

export async function addItemToPlaylist(
  url: string,
  playlistId: string,
  overrides?: { title?: string; platform?: string }
) {
  try {
    const user = await getCurrentUser();

    // Check URL validation first
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
      cleanUrl = cleanUrl.substring(1, cleanUrl.length - 1).trim();
    }
    if (!isValidUrl(cleanUrl)) {
      return { success: false, error: "Invalid URL or local file path." };
    }

    // Ensure the playlist belongs to the user
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, userId: user.id },
      include: {
        items: true,
      },
    });

    if (!playlist) {
      return { success: false, error: "Playlist not found" };
    }

    // Parse the URL to get metadata
    const metadata = await parseUrl(cleanUrl);

    const title = overrides?.title || metadata.title;
    const platform = overrides?.platform || metadata.platform;
    const finalUrl = metadata.url || cleanUrl;

    // Find or create the item for this user
    let item = await prisma.item.findFirst({
      where: {
        userId: user.id,
        source: metadata.source,
        externalId: metadata.externalId,
      },
    });

    if (!item) {
      item = await prisma.item.create({
        data: {
          userId: user.id,
          source: metadata.source,
          externalId: metadata.externalId,
          title,
          description: metadata.description,
          url: finalUrl,
          thumbnailUrl: metadata.thumbnailUrl,
          platform,
          contentType: metadata.contentType,
          favicon: metadata.favicon,
          previewTitle: metadata.previewTitle,
          playlistId: metadata.playlistId,
          videoId: metadata.videoId,
          channelName: metadata.channelName,
        },
      });
    } else {
      // Update item with new fields & overrides
      item = await prisma.item.update({
        where: { id: item.id },
        data: {
          title,
          platform: platform || item.platform,
          contentType: metadata.contentType || item.contentType,
          favicon: metadata.favicon || item.favicon,
          previewTitle: metadata.previewTitle || item.previewTitle,
          playlistId: metadata.playlistId || item.playlistId,
          videoId: metadata.videoId || item.videoId,
          channelName: metadata.channelName || item.channelName,
          url: finalUrl,
          thumbnailUrl: metadata.thumbnailUrl || item.thumbnailUrl,
        },
      });
    }

    // Check if the item is already in this playlist
    const existingPlaylistItem = await prisma.playlistItem.findFirst({
      where: {
        playlistId,
        itemId: item.id,
      },
    });

    if (existingPlaylistItem) {
      return { success: false, error: "Item is already in this playlist" };
    }

    // Calculate the next position
    const maxPositionItem = playlist.items.reduce((max, current) => {
      return current.position > max ? current.position : max;
    }, -1);
    const position = maxPositionItem + 1;

    const playlistItem = await prisma.playlistItem.create({
      data: {
        playlistId,
        itemId: item.id,
        position,
      },
      include: {
        item: true,
      },
    });

    revalidatePath("/");
    return { success: true, playlistItem };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to add item to playlist" };
  }
}

export async function removeItemFromPlaylist(playlistItemId: string) {
  try {
    const user = await getCurrentUser();

    // Find the item association and ensure it belongs to this user
    const playlistItem = await prisma.playlistItem.findFirst({
      where: {
        id: playlistItemId,
        playlist: {
          userId: user.id,
        },
      },
    });

    if (!playlistItem) {
      return { success: false, error: "Item not found in playlist" };
    }

    await prisma.playlistItem.delete({
      where: { id: playlistItemId },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to remove item from playlist" };
  }
}

export async function updatePlaylistItem(
  playlistItemId: string,
  itemId: string,
  newTitle: string,
  newPlaylistId: string
) {
  try {
    const user = await getCurrentUser();

    // Verify ownership of the item
    const item = await prisma.item.findFirst({
      where: { id: itemId, userId: user.id },
    });
    if (!item) {
      return { success: false, error: "Item not found" };
    }

    // Verify ownership of the target playlist
    const targetPlaylist = await prisma.playlist.findFirst({
      where: { id: newPlaylistId, userId: user.id },
    });
    if (!targetPlaylist) {
      return { success: false, error: "Target playlist not found" };
    }

    // Update the item title
    await prisma.item.update({
      where: { id: itemId },
      data: { title: newTitle },
    });

    // Update the playlist item association
    await prisma.playlistItem.update({
      where: { id: playlistItemId },
      data: { playlistId: newPlaylistId },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update item" };
  }
}

export async function getAllItems() {
  try {
    const user = await getCurrentUser();
    const items = await prisma.item.findMany({
      where: { userId: user.id },
      include: {
        playlists: {
          include: {
            playlist: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, items };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch saved items" };
  }
}

export async function getGoogleOAuthUrl() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return { success: false, error: "Google Client ID is not configured. Add GOOGLE_CLIENT_ID to your .env file." };
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/auth/callback/google`;
    const scope = "https://www.googleapis.com/auth/youtube.readonly";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    return { success: true, url };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to generate auth URL" };
  }
}

export async function getYouTubeConnectionStatus() {
  try {
    const user = await getCurrentUser();
    const account = await prisma.account.findFirst({
      where: { userId: user.id, platform: "YOUTUBE" }
    });
    return { success: true, connected: !!account };
  } catch (error: any) {
    return { success: false, connected: false };
  }
}

export async function disconnectYouTube() {
  try {
    const user = await getCurrentUser();
    await prisma.account.deleteMany({
      where: { userId: user.id, platform: "YOUTUBE" }
    });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to disconnect YouTube" };
  }
}

async function refreshYouTubeToken(accountId: string, refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google credentials not configured for refresh");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google token");
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.account.update({
    where: { id: accountId },
    data: {
      accessToken: data.access_token,
      expiresAt,
    },
  });

  return data.access_token;
}

export async function syncYouTubePlaylists() {
  try {
    const user = await getCurrentUser();
    const account = await prisma.account.findFirst({
      where: { userId: user.id, platform: "YOUTUBE" }
    });

    if (!account || !account.accessToken) {
      return { success: false, error: "YouTube account not connected" };
    }

    let token = account.accessToken;
    if (account.expiresAt && account.expiresAt.getTime() - 300000 < Date.now()) {
      if (!account.refreshToken) {
        return { success: false, error: "Token expired and no refresh token available. Reconnect YouTube." };
      }
      token = await refreshYouTubeToken(account.id, account.refreshToken);
    }

    const ytRes = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!ytRes.ok) {
      return { success: false, error: "Failed to fetch playlists from YouTube. Reconnect may be required." };
    }

    const ytData = await ytRes.json();
    const ytPlaylists = ytData.items || [];

    let importCount = 0;

    for (const ytPl of ytPlaylists.slice(0, 3)) {
      const plTitle = ytPl.snippet.title;
      const plDesc = ytPl.snippet.description || "Synced from YouTube";
      const ytPlId = ytPl.id;

      let localPlaylist = await prisma.playlist.findFirst({
        where: { userId: user.id, name: plTitle }
      });

      if (!localPlaylist) {
        localPlaylist = await prisma.playlist.create({
          data: {
            name: plTitle,
            description: plDesc,
            userId: user.id
          }
        });
      }

      const itemsRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${ytPlId}&maxResults=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        const ytItems = itemsData.items || [];

        for (const ytItem of ytItems) {
          const videoId = ytItem.contentDetails?.videoId || ytItem.snippet.resourceId?.videoId;
          if (!videoId) continue;

          const title = ytItem.snippet.title;
          const description = ytItem.snippet.description || "";
          const url = `https://www.youtube.com/watch?v=${videoId}`;
          const thumbnailUrl = ytItem.snippet.thumbnails?.high?.url || ytItem.snippet.thumbnails?.default?.url || null;

          let localItem = await prisma.item.findFirst({
            where: { userId: user.id, source: "YOUTUBE", externalId: videoId }
          });

          if (!localItem) {
            localItem = await prisma.item.create({
              data: {
                userId: user.id,
                source: "YOUTUBE",
                externalId: videoId,
                title,
                description,
                url,
                thumbnailUrl
              }
            });
          }

          const linked = await prisma.playlistItem.findFirst({
            where: { playlistId: localPlaylist.id, itemId: localItem.id }
          });

          if (!linked) {
            const currentItems = await prisma.playlistItem.findMany({
              where: { playlistId: localPlaylist.id }
            });
            const maxPos = currentItems.reduce((max, cur) => cur.position > max ? cur.position : max, -1);

            await prisma.playlistItem.create({
              data: {
                playlistId: localPlaylist.id,
                itemId: localItem.id,
                position: maxPos + 1
              }
            });
            importCount++;
          }
        }
      }
    }

    revalidatePath("/");
    return { success: true, message: `Synced ${importCount} items successfully!` };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to sync YouTube playlists" };
  }
}
