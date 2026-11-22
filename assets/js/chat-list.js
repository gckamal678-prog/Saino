
/* Saino chat list: loads and renders conversations from the existing messenger API. */
(function (global) {
  "use strict";

  if (global.SainoChatList) return;

  let conversations = [];
  let loading = false;
  let loadError = "";
  let activeId = "";
  let searchTerm = "";
  let currentHost = null;
  let refreshQueued = false;

  const language = () => global.KSKLanguage;
  const isEnglish = () => language()?.getLanguage?.() === "en";
  const t = (key, en, ne) =>
    language()?.t?.(key) || (isEnglish() ? en : ne);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function safeImageURL(value) {
    try {
      const url = new URL(String(value || ""), global.location.href);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();

    if (date.toDateString() === now.toDateString() &&
        language()?.formatTime) {
      return language().formatTime(date);
    }

    if (language()?.formatDate) {
      return language().formatDate(date, {
        day: "numeric",
        month: "short"
      });
    }

    return date.toLocaleDateString();
  }

  function previewText(conversation) {
    const message = conversation.lastMessage;

    if (!message) {
      return t(
        "startConversation",
        "Start a conversation",
        "कुराकानी सुरु गर्नुहोस्"
      );
    }

    if (message.deletedAt) {
      return t(
        "messageDeleted",
        "Message deleted",
        "सन्देश हटाइयो"
      );
    }

    if (message.type && message.type !== "text") {
      return message.type === "image"
        ? t("photo", "Photo", "फोटो")
        : t("attachment", "Attachment", "फाइल");
    }

    return message.text || t(
      "noMessages",
      "No messages yet.",
      "अहिलेसम्म कुनै सन्देश छैन।"
    );
  }

  function visibleConversations() {
    const query = searchTerm.trim().toLocaleLowerCase();

    return conversations.filter(item => {
      if (item.isArchived) return false;
      if (!query) return true;

      return `${item.name || ""} ${previewText(item)}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }

  function render() {
    const host = document.querySelector(
      "#saino-app .saino-chat-list"
    );

    if (!host) return;

    currentHost = host;

    if (loading && !conversations.length) {
      host.innerHTML = `
        <div class="saino-empty-state">
          <p>${escapeHTML(t("loading", "Loading…", "लोड हुँदैछ…"))}</p>
        </div>`;
      return;
    }

    if (loadError && !conversations.length) {
      host.innerHTML = `
        <div class="saino-empty-state">
          <p>${escapeHTML(loadError)}</p>
          <button class="saino-button-secondary"
                  type="button"
                  data-saino-chat-retry>
            ${escapeHTML(t("retry", "Try again", "फेरि प्रयास गर्नुहोस्"))}
          </button>
        </div>`;
      return;
    }

    const items = visibleConversations();

    if (!items.length) {
      const message = searchTerm
        ? t("noResults", "No results found.", "कुनै नतिजा भेटिएन।")
        : t("noChats", "No chats yet.", "अहिलेसम्म कुनै च्याट छैन।");

      host.innerHTML = `
        <div class="saino-empty-state">
          <div class="saino-empty-icon" aria-hidden="true">S</div>
          <p>${escapeHTML(message)}</p>
        </div>`;
      return;
    }

    host.innerHTML = items.map(item => {
      const name = item.name ||
        t("conversation", "Conversation", "कुराकानी");

      const avatarURL = safeImageURL(item.avatar);
      const initial = Array.from(name.trim())[0] || "S";

      const avatar = avatarURL
        ? `<img src="${escapeHTML(avatarURL)}"
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer">`
        : escapeHTML(initial);

      const preview = previewText(item);
      const time = formatTime(
        item.lastMessageAt || item.createdAt
      );

      return `
        <div class="saino-chat-item${item.id === activeId ? " active" : ""}"
             role="button"
             tabindex="0"
             data-conversation-id="${escapeHTML(item.id)}"
             aria-label="${escapeHTML(name)}">
          <div class="saino-avatar">${avatar}</div>
          <div class="saino-chat-info">
            <div class="saino-chat-topline">
              <span class="saino-chat-name">${escapeHTML(name)}</span>
              <time class="saino-chat-time">${escapeHTML(time)}</time>
            </div>
            <div class="saino-chat-bottomline">
              <span class="saino-chat-preview">${escapeHTML(preview)}</span>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  async function refresh() {
    const auth = global.KSKSupabaseAuth;
    const messenger = global.KSKSupabaseMessages;

    if (!auth?.isAuthenticated?.() ||
        !messenger?.getConversations) {
      conversations = [];
      loading = false;
      render();
      return;
    }

    loading = true;
    loadError = "";
    render();

    const result = await messenger.getConversations();
    loading = false;

    if (!result?.ok) {
      loadError = result?.message || t(
        "genericError",
        "Something went wrong. Please try again.",
        "केही समस्या भयो। फेरि प्रयास गर्नुहोस्।"
      );

      render();
      return;
    }

    conversations = Array.isArray(result.data)
      ? result.data
      : [];

    if (activeId &&
        !conversations.some(item => item.id === activeId)) {
      activeId = "";
    }

    render();

    global.dispatchEvent(new CustomEvent(
      "saino:chat-list-updated",
      {
        detail: {
          conversations: conversations.slice()
        }
      }
    ));
  }

  function scheduleRefresh() {
    if (refreshQueued) return;

    refreshQueued = true;

    Promise.resolve().then(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function selectConversation(id) {
    const conversation = conversations.find(
      item => item.id === id
    );

    if (!conversation) return;

    activeId = id;
    render();

    global.dispatchEvent(new CustomEvent(
      "saino:conversation-select",
      {
        detail: { conversation }
      }
    ));
  }

  document.addEventListener("click", event => {
    const retry = event.target.closest(
      "[data-saino-chat-retry]"
    );

    if (retry) {
      refresh();
      return;
    }

    const item = event.target.closest(
      "[data-conversation-id]"
    );

    if (item) {
      selectConversation(item.dataset.conversationId);
    }
  });

  document.addEventListener("keydown", event => {
    const item = event.target.closest(
      "[data-conversation-id]"
    );

    if (item && (
      event.key === "Enter" ||
      event.key === " "
    )) {
      event.preventDefault();
      selectConversation(item.dataset.conversationId);
    }
  });

  document.addEventListener("input", event => {
    if (event.target.matches(
      "#saino-app .saino-search input"
    )) {
      searchTerm = event.target.value || "";
      render();
    }
  });

  global.addEventListener("ksk:auth-ready", event => {
    if (event.detail?.user) refresh();
  });

  global.addEventListener("ksk:auth-change", event => {
    if (event.detail?.user) {
      refresh();
    } else {
      conversations = [];
      activeId = "";
      render();
    }
  });

  global.addEventListener(
    "ksk:messages-cloud-change",
    event => {
      const actions = [
        "message-sent",
        "message-edited",
        "message-deleted",
        "realtime-message",
        "conversation-created",
        "group-created"
      ];

      if (actions.includes(event.detail?.action)) {
        refresh();
      }
    }
  );

  global.addEventListener("saino:language-change", render);
  global.addEventListener("ksk:language-change", render);

  const observer = new MutationObserver(() => {
    const host = document.querySelector(
      "#saino-app .saino-chat-list"
    );

    if (host && host !== currentHost) {
      currentHost = host;
      render();

      if (global.KSKSupabaseAuth?.isAuthenticated?.()) {
        scheduleRefresh();
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  global.SainoChatList = Object.freeze({
    refresh,
    getConversations: () => conversations.slice(),
    getActiveConversation: () =>
      conversations.find(item => item.id === activeId) || null
  });
})(window);
