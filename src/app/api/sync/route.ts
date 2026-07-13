import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth";
import { parseUrl } from "../../../lib/parser";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const { url, title, thumbnailUrl, source, playlistName } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    // Determine platform and defaults
    const metadata = await parseUrl(url);
    const finalSource = source || metadata.source;
    const finalTitle = title || metadata.title;
    const finalThumbnailUrl = thumbnailUrl || metadata.thumbnailUrl;
    const finalExternalId = metadata.externalId;

    // Determine target playlist name
    let targetPlaylistName = playlistName;
    if (!targetPlaylistName) {
      if (finalSource === "INSTAGRAM") {
        targetPlaylistName = "Instagram Saved";
      } else if (finalSource === "NETFLIX") {
        targetPlaylistName = "Netflix List";
      } else {
        targetPlaylistName = "Watch Later";
      }
    }

    // Find or create target playlist
    let playlist = await prisma.playlist.findFirst({
      where: {
        userId: user.id,
        name: targetPlaylistName,
      },
      include: {
        items: true,
      },
    });

    if (!playlist) {
      playlist = await prisma.playlist.create({
        data: {
          name: targetPlaylistName,
          description: `Auto-synced from ${finalSource.toLowerCase()}`,
          userId: user.id,
        },
        include: {
          items: true,
        },
      });
    }

    // Find or create item
    let item = await prisma.item.findFirst({
      where: {
        userId: user.id,
        source: finalSource,
        externalId: finalExternalId,
      },
    });

    if (!item) {
      item = await prisma.item.create({
        data: {
          userId: user.id,
          source: finalSource,
          externalId: finalExternalId,
          title: finalTitle,
          url,
          thumbnailUrl: finalThumbnailUrl || null,
        },
      });
    } else if (title || thumbnailUrl) {
      // Update item metadata if extension provides better details
      item = await prisma.item.update({
        where: { id: item.id },
        data: {
          title: finalTitle,
          thumbnailUrl: finalThumbnailUrl || item.thumbnailUrl,
        },
      });
    }

    // Check if item is already in playlist
    const existingPlaylistItem = await prisma.playlistItem.findFirst({
      where: {
        playlistId: playlist.id,
        itemId: item.id,
      },
    });

    if (existingPlaylistItem) {
      return NextResponse.json({
        success: true,
        message: "Item is already in this playlist",
        item,
        playlistItem: existingPlaylistItem,
      });
    }

    // Calculate position
    const maxPositionItem = playlist.items.reduce((max, current) => {
      return current.position > max ? current.position : max;
    }, -1);
    const position = maxPositionItem + 1;

    const playlistItem = await prisma.playlistItem.create({
      data: {
        playlistId: playlist.id,
        itemId: item.id,
        position,
      },
      include: {
        item: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Synced item successfully",
      playlistName: targetPlaylistName,
      item,
      playlistItem,
    });
  } catch (error: any) {
    console.error("Sync API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}

// Add CORS headers for Extension pre-flight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
