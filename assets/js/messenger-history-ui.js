
/* Saino Messenger - Older Message History Pagination */
(function (global) {
  "use strict";

  if (global.SainoMessengerHistory) return;

  const PAGE_SIZE = 50;
  const TOP_THRESHOLD = 64;

  const states = new WeakMap();
  const hostObservers = new WeakMap();
  const observedScrollHosts = new WeakSet();

  let activeConversationId = "";
  let rootObserver = null;
  let attachTimer = null;

  const messenger = () => global.KSKSupabaseMessages;
  const language = () => global.KSKLanguage;

  function t(en, ne) {
    return language()?.getLanguage?.() === "en" ? en : ne;
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return language()?.formatTime
      ? language().formatTime(date)
      : date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        });
  }

  function formatFileSize(value) {
    const size = Number(value) || 0;

    if (size < 1024) return `${size} B`;

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function safeURL(value) {
    try {
      const url = new URL(String(value || ""));

      return url.protocol === "https:" ||
        url.protocol === "http:"
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function messageHost() {
    if (!activeConversationId) return null;

    return document.querySelector(
      `.saino-messages[data-saino-messages="${CSS.escape(activeConversationId)}"]`
    );
  }

  async function createMediaElement(message) {
    const api = messenger();

    if (!message.mediaPath || !api?.getMediaUrl) {
      return null;
    }

    const result = await api.getMediaUrl(message.mediaPath);

    if (!result?.ok || !result.data) {
      const unavailable = document.createElement("div");

      unavailable.className = "saino-media-unavailable";
      unavailable.textContent = t(
        "Media is unavailable.",
        "Media उपलब्ध छैन।"
      );

      return unavailable;
    }

    const url = safeURL(result.data);

    if (!url) {
      const unavailable = document.createElement("div");

      unavailable.className = "saino-media-unavailable";
      unavailable.textContent = t(
        "Could not open this media.",
        "यो Media खोल्न सकिएन।"
      );

      return unavailable;
    }

    const type = String(message.type || "").toLowerCase();
    const mime = String(message.mediaMime || "").toLowerCase();
    const name = String(message.mediaName || "Attachment");

    if (type === "image" || mime.startsWith("image/")) {
      const link = document.createElement("a");

      link.className = "saino-media-image-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", name);

      const image = document.createElement("img");

      image.className = "saino-media-image";
      image.src = url;
      image.alt = name;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      link.appendChild(image);

      return link;
    }

    if (type === "video" || mime.startsWith("video/")) {
      const video = document.createElement("video");

      video.className = "saino-media-video";
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", name);

      return video;
    }

    const link = document.createElement("a");

    link.className = "saino-media-file";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = name;

    const icon = document.createElement("span");

    icon.className = "saino-media-file-icon";
    icon.textContent = mime === "application/pdf"
      ? "PDF"
      : "FILE";

    const details = document.createElement("span");
    details.className = "saino-media-file-details";

    const title = document.createElement("strong");
    title.textContent = name;

    const meta = document.createElement("small");
    meta.textContent = formatFileSize(message.mediaSize);

    details.append(title, meta);
    link.append(icon, details);

    return link;
  }

  async function createMessageRow(message) {
    const outgoing = Boolean(message.fromMe);

    const deleted = Boolean(
      message.deletedAt ||
      message.deletedForEveryone
    );

    const row = document.createElement("div");

    row.className =
      `saino-message-row ${outgoing ? "outgoing" : "incoming"}`;

    /*
     * यी दुवै ID आवश्यक छन्।
     * Message Actions, Search, Receipts र Reply UI ले प्रयोग गर्छन्।
     */
    row.dataset.messageId = message.id;
    row.dataset.sainoMessageId = message.id;

    row.dataset.messageFromMe = String(outgoing);
    row.dataset.messageType = message.type || "text";

    row.dataset.messageDeleted = String(deleted);

    const article = document.createElement("article");
    article.className = "saino-message";

    const text = document.createElement("div");
    text.className = "saino-message-text";

    text.textContent = deleted
      ? t("Message deleted", "सन्देश हटाइयो")
      : (message.text || "");

    article.appendChild(text);

    if (!deleted && message.replyToId) {
      const quote = document.createElement("div");
      quote.className = "saino-message-quoted";

      const label = document.createElement("strong");

      label.textContent = t(
        "Replied message",
        "जवाफ दिइएको सन्देश"
      );

      const excerpt = document.createElement("span");

      excerpt.textContent = t(
        "Original message",
        "मूल सन्देश"
      );

      quote.append(label, excerpt);

      article.insertBefore(quote, text);
    }

    if (!deleted && message.mediaPath) {
      const media = await createMediaElement(message);

      if (media) {
        article.appendChild(media);
      }
    }

    const meta = document.createElement("div");
    meta.className = "saino-message-meta";

    if (message.editedAt && !deleted) {
      const edited = document.createElement("span");

      edited.textContent = t(
        "edited",
        "सम्पादन गरिएको"
      );

      meta.appendChild(edited);
    }

    const time = document.createElement("time");
    time.textContent = formatTime(message.createdAt);

    meta.appendChild(time);
    article.appendChild(meta);

    row.appendChild(article);

    return row;
  }

  function createLoadButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "saino-history-load-button";

    button.textContent = t(
      "Load older messages",
      "पुराना सन्देश लोड गर्नुहोस्"
    );

    button.addEventListener("click", () => {
      const host = messageHost();
      const state = host && states.get(host);

      if (host && state) {
        loadOlder(host, state);
      }
    });

    return button;
  }

  function updateButton(state, loading) {
    if (!state.button) return;

    state.button.disabled = loading;

    state.button.textContent = loading
      ? t(
          "Loading older messages…",
          "पुराना सन्देश लोड हुँदैछन्…"
        )
      : t(
          "Load older messages",
          "पुराना सन्देश लोड गर्नुहोस्"
        );
  }

  function mapInitialRows(rows, messages) {
    if (rows.length !== messages.length) return false;

    rows.forEach((row, index) => {
      const message = messages[index];

      if (!message?.id) return;

      row.dataset.messageId = message.id;
      row.dataset.sainoMessageId = message.id;

      row.dataset.messageFromMe = String(
        Boolean(message.fromMe)
      );

      row.dataset.messageType = message.type || "text";

      row.dataset.messageDeleted = String(
        Boolean(
          message.deletedAt ||
          message.deletedForEveryone
        )
      );
    });

    return true;
  }

  async function initializeHost(host) {
    if (!host?.isConnected || host !== messageHost()) {
      return;
    }

    const rows = [
      ...host.querySelectorAll(":scope > .saino-message-row")
    ];

    if (!rows.length) return;

    const newestRow = rows[rows.length - 1];
    const previous = states.get(host);

    /*
     * पुराना page थपिँदा newest row बदलिँदैन।
     * त्यसैले Pagination फेरि reset हुँदैन।
     */
    if (previous && previous.newestRow === newestRow) {
      return;
    }

    if (previous?.initializing) return;

    if (previous?.button?.isConnected) {
      previous.button.remove();
    }

    const state = {
      initializing: true,
      loading: false,
      hasMore: false,
      oldest: null,
      newestRow,
      button: null,
      generation: (previous?.generation || 0) + 1
    };

    states.set(host, state);

    const conversationId = activeConversationId;

    const result = await messenger().getMessages(
      conversationId,
      { limit: PAGE_SIZE }
    );

    if (
      states.get(host) !== state ||
      conversationId !== activeConversationId ||
      host !== messageHost()
    ) {
      return;
    }

    state.initializing = false;

    if (!result?.ok || !Array.isArray(result.data)) {
      console.warn(
        "Saino history initialization:",
        result?.message
      );
      return;
    }

    const messages = result.data;

    const currentRows = [
      ...host.querySelectorAll(":scope > .saino-message-row")
    ];

    if (currentRows.length !== messages.length) {
      return;
    }

    if (!mapInitialRows(currentRows, messages)) {
      return;
    }

    state.oldest = messages[0] || null;

    state.newestRow =
      currentRows[currentRows.length - 1] || null;

    state.hasMore = messages.length === PAGE_SIZE;

    state.button = createLoadButton();

    if (state.hasMore && state.oldest) {
      host.insertBefore(
        state.button,
        currentRows[0]
      );
    } else {
      state.button.hidden = true;
    }
  }

  async function loadOlder(host, state) {
    if (
      state.loading ||
      state.initializing ||
      !state.hasMore ||
      !state.oldest ||
      host !== messageHost()
    ) {
      return;
    }

    const conversationId = activeConversationId;

    state.loading = true;
    updateButton(state, true);

    try {
      /*
       * Core API को वास्तविक signature:
       * getOlderMessages(conversationId, before, limit)
       */
      const result = await messenger().getOlderMessages(
        conversationId,
        {
          id: state.oldest.id,
          createdAt: state.oldest.createdAt
        },
        PAGE_SIZE
      );

      if (
        states.get(host) !== state ||
        conversationId !== activeConversationId ||
        host !== messageHost()
      ) {
        return;
      }

      if (!result?.ok || !Array.isArray(result.data)) {
        throw new Error(
          result?.message ||
          "पुराना सन्देश लोड गर्न सकिएन।"
        );
      }

      const existingIds = new Set(
        [...host.querySelectorAll(".saino-message-row")]
          .map(row => row.dataset.messageId)
          .filter(Boolean)
      );

      const olderMessages = result.data.filter(
        message =>
          message?.id &&
          !existingIds.has(message.id)
      );

      if (!olderMessages.length) {
        state.hasMore = false;
        state.button.hidden = true;
        return;
      }

      /*
       * Media सहित पूरा row पहिले तयार हुन्छ।
       * त्यसपछि मात्र DOM मा थपिन्छ।
       */
      const newRows = await Promise.all(
        olderMessages.map(message =>
          createMessageRow(message)
        )
      );

      if (
        states.get(host) !== state ||
        conversationId !== activeConversationId ||
        host !== messageHost()
      ) {
        return;
      }

      const fragment = document.createDocumentFragment();

      newRows.forEach(row => {
        fragment.appendChild(row);
      });

      const oldHeight = host.scrollHeight;
      const oldTop = host.scrollTop;

      const firstRow = host.querySelector(
        ":scope > .saino-message-row"
      );

      if (firstRow) {
        host.insertBefore(fragment, firstRow);
      } else if (state.button?.isConnected) {
        host.insertBefore(
          fragment,
          state.button.nextSibling
        );
      } else {
        host.appendChild(fragment);
      }

      state.oldest = olderMessages[0];

      state.hasMore = result.data.length >= PAGE_SIZE;

      if (!state.hasMore) {
        state.button.hidden = true;
      }

      /*
       * पुराना सन्देश थपिँदा प्रयोगकर्ता पढिरहेको
       * स्थान परिवर्तन हुन दिँदैन।
       */
      const newHeight = host.scrollHeight;

      host.scrollTop =
        oldTop + (newHeight - oldHeight);

    } catch (error) {
      console.error(
        "Saino history pagination:",
        error
      );

      if (state.button) {
        state.button.textContent = t(
          "Try loading again",
          "फेरि प्रयास गर्नुहोस्"
        );
      }

    } finally {
      if (states.get(host) === state) {
        state.loading = false;

        if (state.hasMore) {
          updateButton(state, false);
        }
      }
    }
  }

  function attachHost(host) {
    if (
      !host ||
      host.dataset.sainoMessages !== activeConversationId
    ) {
      return;
    }

    if (!observedScrollHosts.has(host)) {
      observedScrollHosts.add(host);

      host.addEventListener("scroll", () => {
        const state = states.get(host);

        if (
          state?.hasMore &&
          !state.loading &&
          !state.initializing &&
          host.scrollTop <= TOP_THRESHOLD
        ) {
          loadOlder(host, state);
        }
      }, { passive: true });
    }

    if (!hostObservers.has(host)) {
      const observer = new MutationObserver(records => {
        const rowChanged = records.some(record => [
          ...record.addedNodes,
          ...record.removedNodes
        ].some(node => {
          if (node.nodeType !== 1) return false;

          return (
            node.matches?.(".saino-message-row") ||
            Boolean(
              node.querySelector?.(".saino-message-row")
            )
          );
        }));

        if (rowChanged) {
          scheduleInitialize(host);
        }
      });

      observer.observe(host, {
        childList: true,
        subtree: true
      });

      hostObservers.set(host, observer);
    }

    scheduleInitialize(host);
  }

  function scheduleInitialize(host) {
    if (attachTimer !== null) {
      global.clearTimeout(attachTimer);
    }

    attachTimer = global.setTimeout(() => {
      attachTimer = null;

      initializeHost(host).catch(error => {
        console.error(
          "Saino history initialization:",
          error
        );
      });
    }, 100);
  }

  function syncConversation(detail = {}) {
    activeConversationId =
      detail.conversation?.id || "";

    const host = messageHost();

    if (host) {
      attachHost(host);
    }
  }

  function observeRoot() {
    const root = document.getElementById("saino-app");

    if (!root || rootObserver) return;

    rootObserver = new MutationObserver(records => {
      const hostAdded = records.some(record =>
        [...record.addedNodes].some(node => {
          if (node.nodeType !== 1) return false;

          return (
            node.matches?.(".saino-messages") ||
            Boolean(node.querySelector?.(".saino-messages"))
          );
        })
      );

      if (hostAdded) {
        const host = messageHost();

        if (host) {
          attachHost(host);
        }
      }
    });

    rootObserver.observe(root, {
      childList: true,
      subtree: true
    });
  }

  global.addEventListener("saino:app-ready", event => {
    syncConversation(event.detail || {});
  });

  global.addEventListener("saino:conversation-select", event => {
    syncConversation(event.detail || {});
  });

  global.addEventListener("ksk:messages-cloud-change", event => {
    const action = event.detail?.action;

    if ([
      "message-sent",
      "message-edited",
      "message-deleted",
      "realtime-message"
    ].includes(action)) {
      const host = messageHost();

      if (host) {
        scheduleInitialize(host);
      }
    }
  });

  function start() {
    observeRoot();

    const host = messageHost();

    if (host) {
      attachHost(host);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

  global.SainoMessengerHistory = Object.freeze({
    refresh: start,

    loadOlder: () => {
      const host = messageHost();
      const state = host && states.get(host);

      if (host && state) {
        return loadOlder(host, state);
      }
    }
  });

})(window);
