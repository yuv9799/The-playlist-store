export interface ParsedMetadata {
  title: string;
  description: string;
  thumbnailUrl: string;
  source: "YOUTUBE" | "NETFLIX" | "INSTAGRAM" | "MANUAL" | "LOCAL";
  externalId: string;
  embedUrl?: string;

  // Future-ready metadata fields
  url?: string; // Optional URL override (e.g. watch+list -> playlist)
  platform?: string; // e.g. "youtube", "instagram", "github", etc.
  contentType?: string; // e.g. "video", "playlist", "article", etc.
  category?: string; // for categorization
  favicon?: string; // favicon url
  previewTitle?: string; // original parsed title
  playlistId?: string; // playlist ID
  videoId?: string; // video ID
  channelName?: string; // author or channel name
}

export async function parseUrl(url: string): Promise<ParsedMetadata> {
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
    cleanUrl = cleanUrl.substring(1, cleanUrl.length - 1).trim();
  }

  // 1. Detect Local Files
  const isLocalFile = cleanUrl.startsWith("file://") ||
    /^[a-zA-Z]:\\/i.test(cleanUrl) ||
    /^[a-zA-Z]:\//i.test(cleanUrl) ||
    (cleanUrl.startsWith("/") && !cleanUrl.startsWith("//") && !cleanUrl.includes(":") && !cleanUrl.includes(".com"));

  if (isLocalFile) {
    let filePath = cleanUrl;
    if (filePath.startsWith("file:///")) {
      filePath = decodeURIComponent(filePath.substring(8));
      if (/^[a-zA-Z]:/i.test(filePath)) {
        filePath = filePath.replace(/\//g, "\\");
      }
    } else if (filePath.startsWith("file://")) {
      filePath = decodeURIComponent(filePath.substring(7));
      if (/^[a-zA-Z]:/i.test(filePath)) {
        filePath = filePath.replace(/\//g, "\\");
      }
    }

    const separator = filePath.includes("\\") ? "\\" : "/";
    const filename = filePath.substring(filePath.lastIndexOf(separator) + 1) || "Local File";

    // Generate icon preview based on file type
    const lowerPath = filePath.toLowerCase();
    let iconSvg = "";
    let contentType = "file";
    let platform = "other";

    if (/\.(mp4|mkv|webm|ogg|mov|avi)$/i.test(lowerPath)) {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 68"><rect width="120" height="68" rx="4" fill="#065f46"/><polygon points="48,22 48,46 76,34" fill="#34d399"/></svg>`;
      contentType = "video";
      platform = "video";
    } else if (/\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(lowerPath)) {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 68"><rect width="120" height="68" rx="4" fill="#312e81"/><circle cx="60" cy="34" r="14" fill="#818cf8"/><path d="M58 26v24M54 32l4-6 4 6M58 38c4 0 8 2 8 6" stroke="#1e1b4b" stroke-width="2" fill="none"/></svg>`;
      contentType = "audio";
      platform = "audio";
    } else if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lowerPath)) {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 68"><rect width="120" height="68" rx="4" fill="#7c2d12"/><rect x="20" y="18" width="80" height="32" rx="2" fill="#fb923c"/><circle cx="44" cy="34" r="6" fill="#7c2d12"/><path d="M20 44l20-14 16 10 12-8 24 16" fill="#7c2d12"/></svg>`;
      contentType = "image";
      platform = "image";
    } else if (/\.pdf$/i.test(lowerPath)) {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 68"><rect width="120" height="68" rx="4" fill="#7f1d1d"/><rect x="24" y="12" width="56" height="44" rx="2" fill="#fecaca"/><line x1="36" y1="26" x2="68" y2="26" stroke="#7f1d1d" stroke-width="3"/><line x1="36" y1="36" x2="68" y2="36" stroke="#7f1d1d" stroke-width="3"/><line x1="36" y1="46" x2="60" y2="46" stroke="#7f1d1d" stroke-width="3"/></svg>`;
      contentType = "pdf";
      platform = "pdf";
    } else {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 68"><rect width="120" height="68" rx="4" fill="#1e293b"/><path d="M32 20h30v6H32zM32 30h40v6H32zM32 40h24v6H32z" fill="#94a3b8"/><path d="M86 28l8-8v32l-8-8z" fill="#cbd5e1"/></svg>`;
    }

    return {
      title: filename,
      description: `Local file located at ${filePath}`,
      thumbnailUrl: `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`,
      source: "LOCAL",
      externalId: filePath,
      embedUrl: `/api/local-file?path=${encodeURIComponent(filePath)}`,
      platform,
      contentType,
      previewTitle: filename,
    };
  }

  // 2. YouTube Parsing (Video and Playlist)
  const isYouTube = /(youtube\.com|youtu\.be)/i.test(cleanUrl);
  if (isYouTube) {
    const listMatch = cleanUrl.match(/[?&]list=([^"&?\/\s]+)/i);
    const videoMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);

    if (listMatch) {
      // It's a YouTube Playlist
      const playlistId = listMatch[1];
      const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
      let title = `YouTube Playlist (${playlistId})`;
      let thumbnailUrl = "";
      let channelName = "";

      try {
        const listRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(playlistUrl)}&format=json`);
        if (listRes.ok) {
          const data = await listRes.json();
          title = data.title || title;
          thumbnailUrl = data.thumbnail_url || "";
          channelName = data.author_name || "";
        }
      } catch (e) {
        console.error("Error fetching YouTube playlist oEmbed:", e);
      }

      return {
        title,
        description: `YouTube Playlist by ${channelName || "Unknown Channel"}`,
        thumbnailUrl,
        source: "YOUTUBE",
        externalId: playlistId,
        url: playlistUrl,
        embedUrl: `https://www.youtube.com/embed/videoseries?list=${playlistId}`,
        platform: "youtube",
        contentType: "playlist",
        playlistId,
        videoId: videoMatch ? videoMatch[1] : undefined,
        channelName,
        previewTitle: title,
      };
    } else if (videoMatch) {
      // It's a YouTube Video
      const videoId = videoMatch[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      let title = `YouTube Video (${videoId})`;
      let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      let channelName = "";

      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`);
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title || title;
          thumbnailUrl = data.thumbnail_url || thumbnailUrl;
          channelName = data.author_name || "";
        }
      } catch (e) {
        console.error("Error fetching YouTube oEmbed:", e);
      }

      return {
        title,
        description: `YouTube Video by ${channelName || "Unknown Channel"}`,
        thumbnailUrl,
        source: "YOUTUBE",
        externalId: videoId,
        url: videoUrl,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        platform: "youtube",
        contentType: "video",
        videoId,
        channelName,
        previewTitle: title,
      };
    }
  }

  // 3. Instagram Parsing
  const isInstagram = /instagram\.com/i.test(cleanUrl);
  if (isInstagram) {
    const postMatch = cleanUrl.match(/instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i);
    const profileMatch = cleanUrl.match(/instagram\.com\/([a-zA-Z0-9_\.]+)/i);

    let externalId = "instagram";
    let contentType = "website";
    let title = "Instagram Content";
    let channelName = "";

    if (postMatch) {
      externalId = postMatch[1];
      contentType = "post";
      title = `Instagram Post (${externalId})`;
    } else if (profileMatch && !["developer", "about", "press", "legal", "explore", "directory"].includes(profileMatch[1].toLowerCase())) {
      externalId = profileMatch[1];
      contentType = "profile";
      title = `@${externalId} on Instagram`;
      channelName = externalId;
    }

    return {
      title,
      description: `Saved from Instagram`,
      thumbnailUrl: "",
      source: "INSTAGRAM",
      externalId,
      platform: "instagram",
      contentType,
      channelName,
      previewTitle: title,
      favicon: "https://www.instagram.com/static/images/ico/favicon.ico/36b30c69fd35.ico",
    };
  }

  // 4. Netflix Parsing
  const isNetflix = /netflix\.com/i.test(cleanUrl);
  if (isNetflix) {
    const netflixMatch = cleanUrl.match(/netflix\.com\/(?:title|watch)\/(\d+)/i);
    const netflixId = netflixMatch ? netflixMatch[1] : "netflix";
    let title = `Netflix Title (${netflixId})`;
    let thumbnailUrl = "";
    let description = "";

    try {
      const res = await fetch(cleanUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (res.ok) {
        const html = await res.text();
        const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
        const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
        const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);

        if (ogTitle) title = ogTitle[1];
        if (ogImage) thumbnailUrl = ogImage[1];
        if (ogDesc) description = ogDesc[1];
      }
    } catch (e) {
      console.error("Error scraping Netflix metadata:", e);
    }

    return {
      title,
      description,
      thumbnailUrl,
      source: "NETFLIX",
      externalId: netflixId,
      platform: "netflix",
      contentType: "video",
      previewTitle: title,
      favicon: "https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico",
    };
  }

  // 5. GitHub Parsing
  const isGitHub = /github\.com/i.test(cleanUrl);
  if (isGitHub) {
    const repoMatch = cleanUrl.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_\.-]+)/i);
    const userMatch = cleanUrl.match(/github\.com\/([a-zA-Z0-9_-]+)/i);

    let title = "GitHub";
    let contentType = "website";
    let channelName = "";
    let externalId = "github";

    if (repoMatch) {
      channelName = repoMatch[1];
      externalId = `${repoMatch[1]}/${repoMatch[2]}`;
      title = `${repoMatch[2]} - GitHub Repository`;
      contentType = "repo";
    } else if (userMatch) {
      channelName = userMatch[1];
      externalId = channelName;
      title = `${channelName} on GitHub`;
      contentType = "profile";
    }

    let description = "GitHub social coding platform";
    try {
      const res = await fetch(cleanUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (res.ok) {
        const html = await res.text();
        const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
        if (ogDesc) description = ogDesc[1];
      }
    } catch (e) {
      console.error("Error scraping GitHub:", e);
    }

    return {
      title,
      description,
      thumbnailUrl: "",
      source: "MANUAL",
      externalId,
      platform: "github",
      contentType,
      channelName,
      previewTitle: title,
      favicon: "https://github.githubassets.com/favicons/favicon.svg",
    };
  }

  // 6. LinkedIn Parsing
  const isLinkedIn = /linkedin\.com/i.test(cleanUrl);
  if (isLinkedIn) {
    return {
      title: "LinkedIn Link",
      description: "LinkedIn platform content",
      thumbnailUrl: "",
      source: "MANUAL",
      externalId: cleanUrl,
      platform: "linkedin",
      contentType: "website",
      previewTitle: "LinkedIn Page",
      favicon: "https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca",
    };
  }

  // 7. Twitter / X Parsing
  const isTwitter = /(twitter\.com|x\.com)/i.test(cleanUrl);
  if (isTwitter) {
    return {
      title: "Twitter / X Post",
      description: "Twitter / X social media post",
      thumbnailUrl: "",
      source: "MANUAL",
      externalId: cleanUrl,
      platform: "twitter",
      contentType: "post",
      previewTitle: "Twitter / X Link",
      favicon: "https://abs.twimg.com/favicons/twitter.3.ico",
    };
  }

  // 8. PDF Check
  const isPdf = /\.pdf$/i.test(cleanUrl);
  if (isPdf) {
    const parts = cleanUrl.split("/");
    const filename = parts[parts.length - 1] || "Document.pdf";
    return {
      title: filename,
      description: "PDF Document Link",
      thumbnailUrl: "",
      source: "MANUAL",
      externalId: cleanUrl,
      platform: "pdf",
      contentType: "pdf",
      previewTitle: filename,
    };
  }

  // 9. General Website Fallback (MANUAL)
  let title = "Web Page";
  let description = "";
  let thumbnailUrl = "";
  let favicon = "";

  try {
    const urlObj = new URL(cleanUrl);
    const domain = urlObj.hostname;
    favicon = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

    const res = await fetch(cleanUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (res.ok) {
      const html = await res.text();
      const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
      const titleTag = html.match(/<title>([^<]+)<\/title>/i);
      const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
      const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);

      if (ogTitle) title = ogTitle[1];
      else if (titleTag) title = titleTag[1];

      if (ogImage) thumbnailUrl = ogImage[1];
      if (ogDesc) description = ogDesc[1];
    }
  } catch (e) {
    console.error("Error scraping manual URL metadata:", e);
  }

  return {
    title,
    description,
    thumbnailUrl,
    source: "MANUAL",
    externalId: cleanUrl,
    platform: "website",
    contentType: "website",
    favicon,
    previewTitle: title,
  };
}
