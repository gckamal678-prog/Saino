
/* Saino Feed UI — uses the existing Supabase Posts adapter. */
(function (global) {
  "use strict";

  if (global.SainoFeedUI) return;

  const SELECTOR = ".saino-conversation";
  const PAGE_SIZE = 20;

  let currentView = "chats";
  let loading = false;
  let creating = false;
  let requestToken = 0;
  let posts = [];
  let oldestCreatedAt = "";
  let hasMore = true;
  let currentUserId = "";

  const api = () => global.KSKSupabasePosts;
  const auth = () => global.KSKSupabaseAuth;

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const text = (en, ne) => isEnglish() ? en : ne;

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  function formatTime(value) {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) return "";

    try {
      return new Intl.DateTimeFormat(
        isEnglish() ? "en" : "ne",
        { dateStyle: "medium", timeStyle: "short" }
      ).format(date);
    } catch (_) {
      return date.toLocaleString();
    }
  }

  function safeMediaURL(value) {
    try {
      const url = new URL(
        String(value || ""),
        global.location.href
      );

      return url.protocol === "https:" ||
        url.protocol === "http:"
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function showToast(message, type = "success") {
    const value = String(message || "").trim();

    if (!value) return;

    let host = document.querySelector(
      ".saino-toast-container"
    );

    if (!host) {
      host = document.createElement("div");
      host.className = "saino-toast-container";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }

    const item = document.createElement("div");

    item.className =
      `saino-toast ${type === "error" ? "error" : "success"}`;

    item.textContent = value;
    host.appendChild(item);

    global.setTimeout(() => {
      item.remove();

      if (!host.childElementCount) {
        host.remove();
      }
    }, 3200);
  }

  function ensureNavigation() {
    const nav = document.querySelector(".saino-tabs");

    if (!nav) return;

    const chats = nav.querySelector(".saino-tab");

    if (chats) {
      chats.dataset.sainoView = "chats";

      chats.classList.toggle(
        "active",
        currentView === "chats"
      );

      chats.setAttribute(
        "aria-current",
        currentView === "chats" ? "page" : "false"
      );
    }

    let feed = nav.querySelector(
      '[data-saino-view="feed"]'
    );

    if (!feed) {
      feed = document.createElement("button");
      feed.type = "button";
      feed.className = "saino-tab";
      feed.dataset.sainoView = "feed";
      nav.appendChild(feed);
    }

    feed.textContent = text("Feed", "फिड");

    feed.classList.toggle(
      "active",
      currentView === "feed"
    );

    feed.setAttribute(
      "aria-current",
      currentView === "feed" ? "page" : "false"
    );
  }

  function renderPost(post) {
    const author = escapeHTML(
      post.author || text("Saino member", "Saino सदस्य")
    );

    const avatar = safeMediaURL(post.authorAvatar);
    const media = safeMediaURL(post.mediaUrl);

    const initial = escapeHTML(
      post.authorInitial || author.slice(0, 1) || "S"
    );

    const isImage = String(
      post.mediaType || ""
    ).startsWith("image/");

    const ownPost =
      String(post.authorId || "") === currentUserId;

    return `
      <article
        class="saino-feed-post"
        data-post-id="${escapeHTML(post.id)}"
      >
        <header class="saino-feed-post-header">

          <div class="saino-feed-avatar">
            ${
              avatar
                ? `<img
                    src="${escapeHTML(avatar)}"
                    alt=""
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  >`
                : initial
            }
          </div>

          <div class="saino-feed-author">
            <strong>${author}</strong>

            <time datetime="${escapeHTML(
              post.createdAt || ""
            )}">
              ${escapeHTML(formatTime(post.createdAt))}
            </time>
          </div>

          ${
            ownPost
              ? `<button
                  type="button"
                  class="saino-feed-delete"
                  data-feed-action="delete"
                  data-post-id="${escapeHTML(post.id)}"
                >${text("Delete", "मेटाउनुहोस्")}</button>`
              : ""
          }

        </header>

        ${
          post.text
            ? `<p class="saino-feed-post-text">${
                escapeHTML(post.text).replace(/\n/g, "<br>")
              }</p>`
            : ""
        }

        ${
          media && isImage
            ? `<a
                class="saino-feed-media-link"
                href="${escapeHTML(media)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  class="saino-feed-media"
                  src="${escapeHTML(media)}"
                  alt="${text("Post image", "पोस्टको फोटो")}"
                  loading="lazy"
                >
              </a>`
            : ""
        }

        <footer class="saino-feed-post-footer">
          <span>
            ${Number(post.commentCount || 0)}
            ${text("comments", "टिप्पणी")}
          </span>
        </footer>
      </article>
    `;
  }

  function renderFeed() {
    const panel = document.querySelector(SELECTOR);

    if (!panel) return;

    panel.className =
      "saino-conversation saino-feed-panel";

    panel.setAttribute(
      "aria-label",
      text("Saino Feed", "Saino फिड")
    );

    const cards = posts.map(renderPost).join("");

    panel.innerHTML = `
      <header class="saino-feed-header">

        <div>
          <h1>${text("Feed", "फिड")}</h1>

          <p>
            ${text(
              "Updates from the Saino community",
              "Saino समुदायका नयाँ अपडेटहरू"
            )}
          </p>
        </div>

        <button
          type="button"
          class="saino-button-secondary saino-feed-refresh"
          data-feed-action="refresh"
        >
          ${text("Refresh", "रिफ्रेस")}
        </button>

      </header>

      <form class="saino-feed-composer" data-feed-form>

        <label
          class="saino-feed-composer-title"
          for="saino-feed-text"
        >
          ${text("Share something", "केही कुरा साझा गर्नुहोस्")}
        </label>

        <textarea
          id="saino-feed-text"
          name="text"
          maxlength="10000"
          rows="3"
          placeholder="${text(
            "What's on your mind?",
            "तपाईंको मनमा के छ?"
          )}"
        ></textarea>

        <div class="saino-feed-composer-actions">

          <label class="saino-feed-file-label">
            ＋ ${text("Add photo", "फोटो थप्नुहोस्")}

            <input
              type="file"
              name="media"
              accept="image/jpeg,image/png,image/webp,image/gif"
            >
          </label>

          <span
            class="saino-feed-file-name"
            data-feed-file-name
          ></span>

          <button
            class="saino-button"
            type="submit"
            data-feed-submit
          >
            ${text("Publish", "प्रकाशित गर्नुहोस्")}
          </button>

        </div>
      </form>

      <div
        class="saino-feed-list"
        data-feed-list
        aria-live="polite"
      >

        ${
          loading && !posts.length
            ? `<p class="saino-feed-state">
                ${text("Loading feed…", "फिड लोड हुँदैछ…")}
              </p>`
            : cards || `<p class="saino-feed-state">
                ${text(
                  "No posts yet. Be the first to share something.",
                  "अहिलेसम्म पोस्ट छैन। पहिलो पोस्ट तपाईंले गर्नुहोस्।"
                )}
              </p>`
        }

      </div>

      <div
        class="saino-feed-more-wrap"
        ${hasMore ? "" : "hidden"}
      >

        <button
          type="button"
          class="saino-button-secondary"
          data-feed-action="more"
          ${loading ? "disabled" : ""}
        >
          ${text("Load more", "थप पोस्ट हेर्नुहोस्")}
        </button>

      </div>
    `;
  }

  async function loadFeed({ append = false } = {}) {
    const service = api();

    if (!service?.getFeed || loading) return;

    loading = true;

    const token = ++requestToken;

    if (!append) {
      posts = [];
      oldestCreatedAt = "";
      hasMore = true;
    }

    if (currentView === "feed") {
      renderFeed();
    }

    try {
      const result = await service.getFeed({
        limit: PAGE_SIZE,
        ...(append && oldestCreatedAt
          ? { before: oldestCreatedAt }
          : {})
      });

      if (token !== requestToken) return;

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          text("Could not load feed.", "फिड लोड गर्न सकिएन।")
        );
      }

      const batch = Array.isArray(result.data)
        ? result.data
        : [];

      const existing = new Set(
        posts.map(post => String(post.id))
      );

      const fresh = batch.filter(
        post => !existing.has(String(post.id))
      );

      posts = append
        ? posts.concat(fresh)
        : fresh;

      if (batch.length) {
        oldestCreatedAt =
          batch[batch.length - 1].createdAt || "";
      }

      hasMore =
        batch.length === PAGE_SIZE &&
        Boolean(oldestCreatedAt);

    } catch (error) {
      console.error("Saino Feed load failed:", error);

      showToast(
        error?.message ||
          text(
            "Feed could not be loaded.",
            "फिड लोड गर्न सकिएन।"
          ),
        "error"
      );

    } finally {
      if (token === requestToken) {
        loading = false;

        if (currentView === "feed") {
          renderFeed();
        }
      }
    }
  }

  async function publish(form) {
    if (creating) return;

    const service = api();

    if (!service?.createPost) {
      showToast(
        text(
          "Posts service is unavailable.",
          "पोस्ट सेवा उपलब्ध छैन।"
        ),
        "error"
      );
      return;
    }

    const submit = form.querySelector(
      "[data-feed-submit]"
    );

    const content = String(
      form.elements.text?.value || ""
    ).trim();

    const file =
      form.elements.media?.files?.[0] || null;

    if (!content && !file) {
      showToast(
        text(
          "Write something or add a photo.",
          "केही लेख्नुहोस् वा फोटो थप्नुहोस्।"
        ),
        "error"
      );
      return;
    }

    creating = true;

    if (submit) submit.disabled = true;

    try {
      const result = await service.createPost({
        text: content,
        media: file
      });

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          text(
            "Post could not be published.",
            "पोस्ट प्रकाशित गर्न सकिएन।"
          )
        );
      }

      form.reset();

      showToast(
        result.message ||
        text("Post published.", "पोस्ट प्रकाशित भयो।")
      );

      await loadFeed();

    } catch (error) {
      showToast(
        error?.message ||
          text(
            "Post could not be published.",
            "पोस्ट प्रकाशित गर्न सकिएन।"
          ),
        "error"
      );

    } finally {
      creating = false;

      if (submit?.isConnected) {
        submit.disabled = false;
      }
    }
  }

  async function deletePost(postId) {
    const service = api();

    if (!service?.deletePost || !postId) return;

    if (!global.confirm(
      text("Delete this post?", "यो पोस्ट मेटाउने हो?")
    )) {
      return;
    }

    try {
      const result = await service.deletePost(postId);

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          text(
            "Post could not be deleted.",
            "पोस्ट मेटाउन सकिएन।"
          )
        );
      }

      posts = posts.filter(
        post => String(post.id) !== String(postId)
      );

      renderFeed();

      showToast(
        text("Post deleted.", "पोस्ट मेटियो।")
      );

    } catch (error) {
      showToast(
        error?.message ||
          text(
            "Post could not be deleted.",
            "पोस्ट मेटाउन सकिएन।"
          ),
        "error"
      );
    }
  }

  function showFeed() {
    currentView = "feed";

    ensureNavigation();

    const app = document.querySelector(".saino-app");

    app?.classList.add("feed-open");

    if (!posts.length) {
      loadFeed();
    } else {
      renderFeed();
    }
  }

  function showChats() {
    currentView = "chats";

    const app = document.querySelector(".saino-app");

    app?.classList.remove("feed-open");

    ensureNavigation();

    global.SainoApp?.render?.();
  }

  document.addEventListener("click", event => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const friendsTab = target.closest(
      "[data-saino-friends-tab]"
    );

    if (friendsTab) {
      currentView = "chats";

      document.querySelector(".saino-app")
        ?.classList.remove("feed-open");

      return;
    }

    const viewButton = target.closest(
      "[data-saino-view]"
    );

    if (viewButton) {
      if (viewButton.dataset.sainoView === "feed") {
        showFeed();
      } else if (
        viewButton.dataset.sainoView === "chats"
      ) {
        showChats();
      }

      return;
    }

    const action = target.closest("[data-feed-action]");

    if (!action) return;

    if (action.dataset.feedAction === "refresh") {
      loadFeed();
    }

    if (action.dataset.feedAction === "more") {
      loadFeed({ append: true });
    }

    if (action.dataset.feedAction === "delete") {
      deletePost(action.dataset.postId);
    }
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-feed-form]");

    if (!form) return;

    event.preventDefault();

    publish(form);
  });

  document.addEventListener("change", event => {
    if (
      event.target.matches(
        '[data-feed-form] input[name="media"]'
      )
    ) {
      const label = document.querySelector(
        "[data-feed-file-name]"
      );

      if (label) {
        label.textContent =
          event.target.files?.[0]?.name || "";
      }
    }
  });

  global.addEventListener("saino:app-ready", event => {
    currentUserId = String(
      event.detail?.user?.id ||
      auth()?.getUser?.()?.id ||
      ""
    );

    ensureNavigation();

    if (currentView === "feed") {
      showFeed();
    }
  });

  global.addEventListener(
    "ksk:posts-cloud-change",
    event => {
      if (
        currentView === "feed" &&
        [
          "create",
          "update",
          "delete",
          "realtime",
          "comment-realtime"
        ].includes(event.detail?.action)
      ) {
        loadFeed();
      }
    }
  );

  global.addEventListener("saino:language-change", () => {
    if (currentView === "feed") {
      renderFeed();
    } else {
      ensureNavigation();
    }
  });

  global.SainoFeedUI = Object.freeze({
    open: showFeed,
    refresh: () => loadFeed(),
    getPosts: () => posts.slice()
  });

})(window);
