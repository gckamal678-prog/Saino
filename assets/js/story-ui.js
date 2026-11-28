/* =========================================================
   SAINO — STORY USER INTERFACE
   Upload • View • Delete • Viewers • 24-hour Stories
========================================================= */

(function (global) {
  "use strict";

  if (global.SainoStoryUI) return;

  const app = () => document.getElementById("saino-app");
  const service = () => global.KSKSupabaseStories;

  let storyGroups = [];
  let activeGroup = 0;
  let activeStory = 0;
  let refreshInProgress = false;
  let viewerObjectUrl = null;

  const tr = (ne, en) =>
    global.KSKLanguage?.getLanguage?.() === "en" ? en : ne;

  const text = {
    title: () => tr("स्टोरीहरू", "Stories"),
    add: () => tr("स्टोरी थप्नुहोस्", "Add story"),
    empty: () => tr("अहिलेसम्म कुनै Story छैन। आफ्नो पहिलो Story साझा गर्नुहोस्।", "No stories yet. Share your first story."),
    loading: () => tr("स्टोरी लोड हुँदैछ...", "Loading stories..."),
    upload: () => tr("अपलोड गर्नुहोस्", "Upload"),
    caption: () => tr("स्टोरीमा केही लेख्नुहोस्...", "Add a caption..."),
    choose: () => tr("फोटो वा भिडियो छान्नुहोस्", "Choose a photo or video"),
    image: () => tr("फोटो", "Photo"),
    video: () => tr("भिडियो", "Video"),
    viewers: () => tr("हेर्नेहरू", "Viewers"),
    delete: () => tr("मेटाउनुहोस्", "Delete"),
    cancel: () => tr("रद्द गर्नुहोस्", "Cancel"),
    close: () => tr("बन्द गर्नुहोस्", "Close"),
    own: () => tr("मेरो Story", "My story"),
    noViewers: () => tr("अहिलेसम्म कसैले हेरेको छैन।", "No views yet."),
    confirmDelete: () => tr("यो Story मेटाउने हो?", "Delete this story?"),
    login: () => tr("पहिले लगइन गर्नुहोस्।", "Please log in first."),
    failed: () => tr("स्टोरी लोड हुन सकेन। फेरि प्रयास गर्नुहोस्।", "Could not load stories. Please try again."),
    uploadFailed: () => tr("Story अपलोड हुन सकेन।", "Story upload failed."),
    uploaded: () => tr("Story सफलतापूर्वक अपलोड भयो।", "Story uploaded successfully."),
    deleted: () => tr("Story मेटाइयो।", "Story deleted."),
    invalid: () => tr("मान्य फोटो वा भिडियो छान्नुहोस्।", "Choose a valid photo or video."),
    size: () => tr("फाइलको आकार अनुमति गरिएको सीमाभन्दा बढी छ।", "The file is larger than the allowed limit."),
    hours: () => tr("घण्टा बाँकी", "hours left"),
    justNow: () => tr("भर्खरै", "Just now"),
    error: () => tr("केही समस्या आयो। फेरि प्रयास गर्नुहोस्।", "Something went wrong. Please try again.")
  };

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function notify(message, type = "info") {
    if (typeof global.KSKToast?.show === "function") {
      global.KSKToast.show(message, type);
    } else {
      console.info("[Saino Story]", message);
    }
  }

  function currentUser() {
    return global.KSKSupabaseAuth?.getUser?.() || null;
  }

  function currentUserId() {
    return currentUser()?.id || "";
  }

  function resultData(result) {
    if (result?.ok === false) {
      throw new Error(result.message || text.error());
    }

    return result?.data ?? result;
  }

  function getGroups(data) {
    if (Array.isArray(data)) return data;

    if (Array.isArray(data?.groups)) return data.groups;
    if (Array.isArray(data?.stories)) return groupStories(data.stories);

    return [];
  }

  function groupStories(stories) {
    const map = new Map();

    (stories || []).forEach(story => {
      const userId = story.userId || story.user_id || story.user?.id;
      if (!userId) return;

      if (!map.has(userId)) {
        map.set(userId, {
          user: story.user || {
            id: userId,
            name: story.userName || story.name || tr("प्रयोगकर्ता", "User"),
            avatar: story.avatarUrl || story.avatar_url || ""
          },
          stories: []
        });
      }

      map.get(userId).stories.push(story);
    });

    return [...map.values()];
  }

  function normalizeGroup(group) {
    const user = group?.user || group?.profile || {};
    const stories = Array.isArray(group?.stories)
      ? group.stories
      : group?.story
        ? [group.story]
        : [];

    return {
      user: {
        id: user.id || user.userId || group.userId || group.user_id || "",
        name: user.name || user.full_name || user.first_name || tr("प्रयोगकर्ता", "User"),
        avatar: user.avatar || user.avatarUrl || user.avatar_url || ""
      },
      stories: stories.map(story => ({
        ...story,
        id: story.id,
        mediaPath: story.mediaPath || story.media_path || "",
        mediaUrl: story.mediaUrl || story.media_url || story.url || "",
        mediaType: story.mediaType || story.media_type || "",
        caption: story.caption || "",
        createdAt: story.createdAt || story.created_at || "",
        expiresAt: story.expiresAt || story.expires_at || "",
        viewCount: Number(story.viewCount ?? story.view_count ?? 0),
        viewed: Boolean(story.viewed ?? story.isViewed ?? story.is_viewed)
      })).filter(story => story.id)
    };
  }

  function allGroups() {
    return storyGroups.map(normalizeGroup).filter(group => group.stories.length);
  }

  function getMediaUrl(story) {
    return story.mediaUrl || story.media_url || story.url || "";
  }

  async function resolveMediaUrl(story) {
    const direct = getMediaUrl(story);
    if (direct) return direct;

    const path = story.mediaPath || story.media_path;
    if (!path) return "";

    const api = service();
    if (typeof api?.getSignedMediaUrl !== "function") return "";

    const result = await api.getSignedMediaUrl(path);
    const data = resultData(result);

    if (typeof data === "string") return data;

    return data?.url || data?.signedUrl || data?.signedURL || "";
  }

  function timeRemaining(story) {
    if (!story.expiresAt) return "";

    const remaining = new Date(story.expiresAt).getTime() - Date.now();
    if (remaining <= 0) return tr("समाप्त", "Expired");

    const hours = Math.floor(remaining / 3600000);
    if (hours < 1) return tr("१ घण्टाभन्दा कम", "Less than 1 hour");

    return `${hours} ${text.hours()}`;
  }

  function timeAgo(value) {
    if (!value) return text.justNow();

    const minutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(value).getTime()) / 60000)
    );

    if (minutes < 1) return text.justNow();
    if (minutes < 60) return `${minutes} ${tr("मिनेटअघि", "min ago")}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${tr("घण्टाअघि", "hours ago")}`;

    return `${Math.floor(hours / 24)} ${tr("दिनअघि", "days ago")}`;
  }

  function avatarHTML(user, extraClass = "") {
    const name = escapeHTML(user?.name || "Saino");
    const avatar = user?.avatar || "";

    if (avatar) {
      return `
        <img
          class="${extraClass}"
          src="${escapeHTML(avatar)}"
          alt="${name}"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
      `;
    }

    return `
      <span class="${extraClass} saino-story-avatar-fallback">
        ${escapeHTML(name.charAt(0).toUpperCase())}
      </span>
    `;
  }

  function ensurePage() {
    const host = app();
    if (!host) return null;

    host.querySelector(".saino-friends-page")?.remove();

    const sidebar = host.querySelector(".saino-sidebar");
    sidebar?.classList.remove("saino-hidden");

    host.classList.remove("feed-open");
    host.classList.add("story-open");

    let panel = host.querySelector(".saino-conversation");

    if (!panel) {
      panel = document.createElement("section");
      panel.className = "saino-conversation";
      host.appendChild(panel);
    }

    panel.className = "saino-conversation saino-story-page";
    panel.setAttribute("aria-label", text.title());

    return panel;
  }

  function renderLoading() {
    const panel = ensurePage();
    if (!panel) return;

    panel.innerHTML = `
      <div class="saino-story-loading" role="status">
        <span class="saino-story-spinner"></span>
        <p>${text.loading()}</p>
      </div>
    `;
  }

  function renderError(message) {
    const panel = ensurePage();
    if (!panel) return;

    panel.innerHTML = `
      <section class="saino-story-empty">
        <div class="saino-story-symbol" aria-hidden="true">!</div>
        <h2>${text.title()}</h2>
        <p>${escapeHTML(message || text.failed())}</p>
        <button type="button" class="saino-story-primary" data-story-action="refresh">
          ${tr("फेरि प्रयास गर्नुहोस्", "Try again")}
        </button>
      </section>
    `;
  }

  function render() {
    const panel = ensurePage();
    if (!panel) return;

    const groups = allGroups();
    const myId = currentUserId();

    const ownGroup = groups.find(group => group.user.id === myId);
    const friendGroups = groups.filter(group => group.user.id !== myId);

    const ownCard = ownGroup
      ? renderStoryCard(ownGroup, true)
      : `
        <button class="saino-story-add-card" type="button" data-story-action="add">
          <span class="saino-story-add-avatar">+</span>
          <strong>${text.add()}</strong>
        </button>
      `;

    panel.innerHTML = `
      <div class="saino-story-content">

        <header class="saino-story-header">
          <div>
            <h1>${text.title()}</h1>
            <p>${tr("आफ्ना पलहरू साथीहरूसँग साझा गर्नुहोस्", "Share moments with your friends")}</p>
          </div>

          <button
            type="button"
            class="saino-story-refresh"
            data-story-action="refresh"
            aria-label="${tr("रिफ्रेस", "Refresh")}"
            title="${tr("रिफ्रेस", "Refresh")}"
          >↻</button>
        </header>

        <section class="saino-story-strip" aria-label="${text.title()}">
          <div class="saino-story-own">
            ${ownCard}
          </div>

          ${friendGroups.map(group => renderStoryCard(group, false)).join("")}
        </section>

        <section class="saino-story-feed">
          ${
            groups.length
              ? `
                <h2>${tr("हालका Story", "Recent stories")}</h2>
                <div class="saino-story-list">
                  ${groups.map(group => renderStoryRow(group, group.user.id === myId)).join("")}
                </div>
              `
              : `
                <div class="saino-story-empty">
                  <div class="saino-story-symbol" aria-hidden="true">◉</div>
                  <h2>${text.title()}</h2>
                  <p>${text.empty()}</p>
                  <button type="button" class="saino-story-primary" data-story-action="add">
                    + ${text.add()}
                  </button>
                </div>
              `
          }
        </section>
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
        hidden
        data-story-file
      >
    `;
  }

  function renderStoryCard(group, isOwn) {
    const user = group.user;
    const latest = group.stories[group.stories.length - 1];
    const viewed = group.stories.every(story => story.viewed);

    return `
      <button
        type="button"
        class="saino-story-card ${viewed ? "is-viewed" : "is-unviewed"} ${isOwn ? "is-own" : ""}"
        data-story-action="open-group"
        data-user-id="${escapeHTML(user.id)}"
        aria-label="${escapeHTML(user.name)}"
      >
        <span class="saino-story-ring">
          ${avatarHTML(user, "saino-story-card-avatar")}
        </span>
        <span class="saino-story-card-name">
          ${isOwn ? text.own() : escapeHTML(user.name)}
        </span>
        ${
          isOwn
            ? `<span class="saino-story-card-add">+</span>`
            : `<span class="saino-story-card-count">${group.stories.length}</span>`
        }
      </button>
    `;
  }

  function renderStoryRow(group, isOwn) {
    const latest = group.stories[group.stories.length - 1];

    return `
      <article class="saino-story-row">
        <button
          type="button"
          class="saino-story-row-main"
          data-story-action="open-group"
          data-user-id="${escapeHTML(group.user.id)}"
        >
          <span class="saino-story-row-avatar">
            ${avatarHTML(group.user)}
          </span>

          <span class="saino-story-row-info">
            <strong>${isOwn ? text.own() : escapeHTML(group.user.name)}</strong>
            <small>${timeAgo(latest.createdAt)} · ${timeRemaining(latest)}</small>
          </span>

          <span class="saino-story-row-count">${group.stories.length}</span>
        </button>

        ${
          isOwn
            ? `
              <button
                type="button"
                class="saino-story-viewers-button"
                data-story-action="viewers"
                data-story-id="${escapeHTML(latest.id)}"
              >${text.viewers()} (${latest.viewCount})</button>
            `
            : ""
        }
      </article>
    `;
  }

  async function loadStories() {
    if (refreshInProgress) return;

    const api = service();
    if (!api || typeof api.getStories !== "function") {
      renderError(tr("Story सेवा जोडिएको छैन।", "Story service is not connected."));
      return;
    }

    refreshInProgress = true;
    renderLoading();

    try {
      const auth = global.KSKSupabaseAuth;
      await auth?.initialize?.();

      if (!auth?.isAuthenticated?.()) {
        renderError(text.login());
        return;
      }

      const result = await api.getStories({ limit: 100 });
      const data = resultData(result);

      storyGroups = getGroups(data);
      render();
    } catch (error) {
      console.error("Saino Story load error:", error);
      renderError(error.message || text.failed());
    } finally {
      refreshInProgress = false;
    }
  }

  function open() {
    renderLoading();
    loadStories();
    global.SainoNavigation?.setActive?.("story");
  }

  function close() {
    const host = app();
    host?.classList.remove("story-open");
    closeViewer();
    closeUpload();
    closeViewers();
  }

  function findGroup(userId) {
    return allGroups().find(group => group.user.id === userId);
  }

  async function openGroup(userId) {
    const group = findGroup(userId);
    if (!group) {
      await loadStories();
      return;
    }

    activeGroup = allGroups().findIndex(item => item.user.id === userId);
    activeStory = 0;
    await showStory();
  }

  async function showStory() {
    const groups = allGroups();
    const group = groups[activeGroup];

    if (!group) {
      closeViewer();
      return;
    }

    const story = group.stories[activeStory];

    if (!story) {
      closeViewer();
      return;
    }

    const panel = ensurePage();
    if (!panel) return;

    let url = "";
    try {
      url = await resolveMediaUrl(story);
    } catch (error) {
      console.warn("Story media URL error:", error);
    }

    if (!url) {
      notify(text.failed(), "error");
      nextStory();
      return;
    }

    const own = group.user.id === currentUserId();
    const isVideo = story.mediaType === "video" ||
      String(story.mediaPath).match(/\.(mp4|webm)$/i);

    const media = isVideo
      ? `
        <video
          class="saino-story-viewer-media"
          src="${escapeHTML(url)}"
          autoplay
          playsinline
          controls
        ></video>
      `
      : `
        <img
          class="saino-story-viewer-media"
          src="${escapeHTML(url)}"
          alt="${escapeHTML(group.user.name)}"
        >
      `;

    panel.querySelector(".saino-story-viewer")?.remove();

    const viewer = document.createElement("section");
    viewer.className = "saino-story-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", tr("Story हेर्दै", "Viewing story"));

    const progress = group.stories.map((item, index) => `
      <span class="saino-story-progress-track">
        <span class="saino-story-progress-fill ${index < activeStory ? "is-done" : ""} ${index === activeStory ? "is-active" : ""}"></span>
      </span>
    `).join("");

    viewer.innerHTML = `
      <div class="saino-story-viewer-backdrop"></div>

      <div class="saino-story-viewer-panel">
        <div class="saino-story-progress">${progress}</div>

        <header class="saino-story-viewer-header">
          <span class="saino-story-viewer-avatar">
            ${avatarHTML(group.user)}
          </span>

          <span class="saino-story-viewer-user">
            <strong>${escapeHTML(group.user.name)}</strong>
            <small>${timeAgo(story.createdAt)} · ${timeRemaining(story)}</small>
          </span>

          ${
            own
              ? `
                <button type="button" data-story-action="viewers" data-story-id="${escapeHTML(story.id)}">
                  ${text.viewers()} (${story.viewCount})
                </button>
                <button type="button" data-story-action="delete" data-story-id="${escapeHTML(story.id)}">
                  ${text.delete()}
                </button>
              `
              : ""
          }

          <button type="button" class="saino-story-viewer-close" data-story-action="close-viewer" aria-label="${text.close()}">×</button>
        </header>

        <div class="saino-story-viewer-stage">
          <button type="button" class="saino-story-prev" data-story-action="previous" aria-label="${tr("अघिल्लो", "Previous")}"></button>
          ${media}
          <button type="button" class="saino-story-next" data-story-action="next" aria-label="${tr("अर्को", "Next")}"></button>
        </div>

        ${
          story.caption
            ? `<p class="saino-story-viewer-caption">${escapeHTML(story.caption)}</p>`
            : ""
        }
      </div>
    `;

    panel.appendChild(viewer);

    if (!own && typeof service()?.recordView === "function") {
      try {
        await service().recordView(story.id);
        story.viewed = true;
      } catch (error) {
        console.warn("Story view record:", error);
      }
    }
  }

  function nextStory() {
    const groups = allGroups();
    const group = groups[activeGroup];

    if (!group) return;

    if (activeStory < group.stories.length - 1) {
      activeStory++;
      showStory();
    } else if (activeGroup < groups.length - 1) {
      activeGroup++;
      activeStory = 0;
      showStory();
    } else {
      closeViewer();
      loadStories();
    }
  }

  function previousStory() {
    if (activeStory > 0) {
      activeStory--;
      showStory();
      return;
    }

    if (activeGroup > 0) {
      activeGroup--;
      const groups = allGroups();
      activeStory = Math.max(0, groups[activeGroup]?.stories.length - 1);
      showStory();
    }
  }

  function closeViewer() {
    app()?.querySelector(".saino-story-viewer")?.remove();
  }

  function openUpload() {
    if (!currentUserId()) {
      notify(text.login(), "error");
      return;
    }

    closeUpload();

    const panel = ensurePage();
    if (!panel) return;

    const modal = document.createElement("div");
    modal.className = "saino-story-upload-modal";
    modal.innerHTML = `
      <div class="saino-story-modal-backdrop" data-story-action="close-upload"></div>

      <form class="saino-story-upload-form" data-story-upload-form>
        <header>
          <h2>${text.add()}</h2>
          <button type="button" data-story-action="close-upload" aria-label="${text.close()}">×</button>
        </header>

        <label class="saino-story-file-label">
          <span class="saino-story-file-icon">＋</span>
          <strong>${text.choose()}</strong>
          <small>${tr("JPG, PNG, WebP, GIF वा MP4/WebM", "JPG, PNG, WebP, GIF or MP4/WebM")}</small>
          <input
            type="file"
            name="media"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            required
          >
        </label>

        <div class="saino-story-upload-preview" data-story-preview hidden></div>

        <textarea
          name="caption"
          maxlength="500"
          rows="3"
          placeholder="${text.caption()}"
        ></textarea>

        <div class="saino-story-upload-actions">
          <button type="button" class="saino-story-secondary" data-story-action="close-upload">
            ${text.cancel()}
          </button>
          <button type="submit" class="saino-story-primary">
            ${text.upload()}
          </button>
        </div>

        <p class="saino-story-upload-status" data-story-upload-status aria-live="polite"></p>
      </form>
    `;

    panel.appendChild(modal);

    const input = modal.querySelector('input[type="file"]');
    input?.addEventListener("change", () => previewFile(input.files?.[0], modal));
  }

  function previewFile(file, modal) {
    const preview = modal.querySelector("[data-story-preview]");
    if (!preview) return;

    if (viewerObjectUrl) {
      URL.revokeObjectURL(viewerObjectUrl);
      viewerObjectUrl = null;
    }

    if (!file) {
      preview.hidden = true;
      preview.innerHTML = "";
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      notify(text.invalid(), "error");
      return;
    }

    viewerObjectUrl = URL.createObjectURL(file);

    preview.hidden = false;
    preview.innerHTML = file.type.startsWith("video/")
      ? `<video src="${viewerObjectUrl}" controls playsinline></video>`
      : `<img src="${viewerObjectUrl}" alt="Story preview">`;
  }

  function closeUpload() {
    const modal = app()?.querySelector(".saino-story-upload-modal");
    modal?.remove();

    if (viewerObjectUrl) {
      URL.revokeObjectURL(viewerObjectUrl);
      viewerObjectUrl = null;
    }
  }

  async function uploadStory(form) {
    const api = service();
    if (!api || typeof api.createStory !== "function") {
      notify(text.uploadFailed(), "error");
      return;
    }

    const file = form.querySelector('input[name="media"]')?.files?.[0];
    const caption = form.querySelector('textarea[name="caption"]')?.value || "";

    if (!file) {
      notify(text.invalid(), "error");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      notify(text.invalid(), "error");
      return;
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;

    if (file.size > maxSize) {
      notify(text.size(), "error");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[data-story-upload-status]");

    submit.disabled = true;
    submit.textContent = tr("अपलोड हुँदैछ...", "Uploading...");
    if (status) status.textContent = tr("कृपया केही समय पर्खनुहोस्।", "Please wait...");

    try {
      const result = await api.createStory({ file, caption: caption.trim() });
      resultData(result);

      closeUpload();
      notify(text.uploaded(), "success");
      await loadStories();
    } catch (error) {
      console.error("Saino Story upload error:", error);
      if (status) status.textContent = error.message || text.uploadFailed();
      notify(error.message || text.uploadFailed(), "error");
      submit.disabled = false;
      submit.textContent = text.upload();
    }
  }

  async function deleteStory(storyId) {
    if (!storyId || !global.confirm(text.confirmDelete())) return;

    try {
      const result = await service().deleteStory(storyId);
      resultData(result);

      closeViewer();
      notify(text.deleted(), "success");
      await loadStories();
    } catch (error) {
      console.error("Saino Story delete error:", error);
      notify(error.message || text.error(), "error");
    }
  }

  async function showViewers(storyId) {
    if (!storyId) return;

    try {
      const result = await service().getStoryViewers(storyId);
      const data = resultData(result);
      const viewers = Array.isArray(data)
        ? data
        : data?.viewers || [];

      closeViewers();

      const panel = ensurePage();
      if (!panel) return;

      const modal = document.createElement("div");
      modal.className = "saino-story-viewers-modal";

      modal.innerHTML = `
        <div class="saino-story-modal-backdrop" data-story-action="close-viewers"></div>
        <section class="saino-story-viewers-panel" role="dialog" aria-modal="true">
          <header>
            <h2>${text.viewers()} (${viewers.length})</h2>
            <button type="button" data-story-action="close-viewers">×</button>
          </header>

          <div class="saino-story-viewers-list">
            ${
              viewers.length
                ? viewers.map(viewer => {
                    const user = viewer.user || viewer.profile || viewer;
                    const name = user.name || user.full_name || user.first_name || tr("प्रयोगकर्ता", "User");
                    const avatar = user.avatar || user.avatar_url || user.avatarUrl || "";
                    return `
                      <div class="saino-story-viewer-row">
                        ${avatarHTML({ name, avatar })}
                        <strong>${escapeHTML(name)}</strong>
                      </div>
                    `;
                  }).join("")
                : `<p class="saino-story-no-viewers">${text.noViewers()}</p>`
            }
          </div>
        </section>
      `;

      panel.appendChild(modal);
    } catch (error) {
      console.error("Saino Story viewers error:", error);
      notify(error.message || text.error(), "error");
    }
  }

  function closeViewers() {
    app()?.querySelector(".saino-story-viewers-modal")?.remove();
  }

  function onClick(event) {
    const button = event.target.closest("[data-story-action]");
    if (!button || !app()?.contains(button)) return;

    const action = button.dataset.storyAction;

    if (action === "add") {
      openUpload();
    } else if (action === "refresh") {
      loadStories();
    } else if (action === "open-group") {
      openGroup(button.dataset.userId);
    } else if (action === "close-viewer") {
      closeViewer();
    } else if (action === "next") {
      nextStory();
    } else if (action === "previous") {
      previousStory();
    } else if (action === "close-upload") {
      closeUpload();
    } else if (action === "delete") {
      deleteStory(button.dataset.storyId);
    } else if (action === "viewers") {
      showViewers(button.dataset.storyId);
    } else if (action === "close-viewers") {
      closeViewers();
    }
  }

  function onSubmit(event) {
    const form = event.target.closest("[data-story-upload-form]");
    if (!form) return;

    event.preventDefault();
    uploadStory(form);
  }

  function onKeydown(event) {
    if (!app()?.classList.contains("story-open")) return;

    if (event.key === "Escape") {
      closeViewer();
      closeUpload();
      closeViewers();
    } else if (event.key === "ArrowRight") {
      nextStory();
    } else if (event.key === "ArrowLeft") {
      previousStory();
    }
  }

  function bindEvents() {
    const host = app();
    if (!host || host.dataset.storyEventsBound === "true") return;

    host.dataset.storyEventsBound = "true";
    host.addEventListener("click", onClick);
    host.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeydown);

    global.addEventListener("ksk:stories-cloud-change", () => {
      if (host.classList.contains("story-open")) loadStories();
    });

    global.addEventListener("ksk:auth-change", () => {
      if (host.classList.contains("story-open")) loadStories();
    });
  }

  function initialize() {
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  global.SainoStoryUI = Object.freeze({
    open,
    close,
    refresh: loadStories,
    add: openUpload,
    openGroup
  });

})(window);
