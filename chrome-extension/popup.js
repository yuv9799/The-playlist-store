document.addEventListener("DOMContentLoaded", async () => {
  const titleEl = document.getElementById("item-title");
  const badgeEl = document.getElementById("source-badge");
  const playlistSelect = document.getElementById("playlist-select");
  const syncBtn = document.getElementById("sync-btn");
  const statusBox = document.getElementById("status-box");

  let pageData = null;

  const showStatus = (message, type) => {
    statusBox.textContent = message;
    statusBox.className = `status status-${type}`;
    statusBox.style.display = "block";
  };

  const hideStatus = () => {
    statusBox.style.display = "none";
  };

  try {
    // 1. Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      titleEl.textContent = "Unable to read page URL.";
      return;
    }

    // Don't support browser internal pages
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("about:")) {
      titleEl.textContent = "Chrome system pages cannot be synced.";
      return;
    }

    // 2. Inject scripting to scrape details
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePageDetails
    }, (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) {
        // Fallback if scripting is blocked (e.g., in web store or protected page)
        const url = tab.url;
        let source = "MANUAL";
        let title = tab.title || "Web Page";
        let thumbnailUrl = "";

        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          source = "YOUTUBE";
        } else if (url.includes("netflix.com")) {
          source = "NETFLIX";
        } else if (url.includes("instagram.com")) {
          source = "INSTAGRAM";
        }

        pageData = { title, url, thumbnailUrl, source };
      } else {
        pageData = results[0].result;
      }

      // Update popup UI
      titleEl.textContent = pageData.title;
      badgeEl.textContent = pageData.source === "YOUTUBE" ? "YouTube" : 
                            pageData.source === "NETFLIX" ? "Netflix" :
                            pageData.source === "INSTAGRAM" ? "Instagram" : "Web Page";
      
      badgeEl.className = `source-badge source-${pageData.source.toLowerCase()}`;

      // Select default playlist based on detected platform
      if (pageData.source === "NETFLIX") {
        playlistSelect.value = "Netflix List";
      } else if (pageData.source === "INSTAGRAM") {
        playlistSelect.value = "Instagram Saved";
      } else if (pageData.source === "YOUTUBE") {
        playlistSelect.value = "Watch Later";
      } else {
        playlistSelect.value = "Watch Later";
      }

      // Enable sync button
      syncBtn.disabled = false;
    });

  } catch (error) {
    titleEl.textContent = "Error accessing active tab.";
    console.error(error);
  }

  // 3. Sync button listener
  syncBtn.addEventListener("click", async () => {
    if (!pageData) return;

    syncBtn.disabled = true;
    showStatus("Syncing to Homepage...", "loading");

    try {
      const response = await fetch("http://localhost:3000/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: pageData.url,
          title: pageData.title,
          thumbnailUrl: pageData.thumbnailUrl,
          source: pageData.source,
          playlistName: playlistSelect.value
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showStatus(`Successfully synced to "${result.playlistName}"!`, "success");
      } else {
        showStatus(result.error || "Failed to sync link.", "error");
        syncBtn.disabled = false;
      }
    } catch (e) {
      showStatus("Server unreachable. Ensure Homepage dashboard is running locally at http://localhost:3000", "error");
      syncBtn.disabled = false;
    }
  });
});

// This function runs in the context of the active tab
function scrapePageDetails() {
  const url = window.location.href;
  let title = document.title;
  let thumbnailUrl = "";
  let source = "MANUAL";

  if (url.includes("youtube.com/watch") || url.includes("youtu.be/") || url.includes("youtube.com/shorts")) {
    source = "YOUTUBE";
    const ytTitleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string") || 
                      document.querySelector(".ytd-video-primary-info-renderer .title yt-formatted-string");
    if (ytTitleEl) {
      title = ytTitleEl.textContent.trim();
    }
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
    if (ytMatch) {
      thumbnailUrl = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }
  } else if (url.includes("netflix.com/")) {
    source = "NETFLIX";
    const nTitleEl = document.querySelector(".title-logo")?.getAttribute("alt") || 
                     document.querySelector(".video-title h2")?.textContent || 
                     document.querySelector(".about-header h3")?.textContent;
    if (nTitleEl) {
      title = nTitleEl.trim();
    }
    title = title.replace(" - Netflix", "");
  } else if (url.includes("instagram.com/")) {
    source = "INSTAGRAM";
    const instaTitleEl = document.querySelector("header h2") || 
                         document.querySelector("header a");
    if (instaTitleEl) {
      title = `Instagram post by @${instaTitleEl.textContent.trim()}`;
    } else {
      // Clean up standard login redirection page title
      title = document.title.replace(" • Instagram photos and videos", "");
    }
    // Attempt to scrape image thumbnail from first post photo or video poster
    const imgEl = document.querySelector("article img");
    if (imgEl) {
      thumbnailUrl = imgEl.src;
    }
  }

  return { title, url, thumbnailUrl, source };
}
