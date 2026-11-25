
/*
 * SAINO — MESSAGE REPLY UI
 * Adds reply controls and quoted-message previews without changing app.js.
 */
(function (global) {
  "use strict";

  if (global.SainoMessageReplyUI) return;

  let conversation = null;
  let selectedMessage = null;
  let messageMap = new Map();
  let observer = null;
  let refreshTimer = null;
  let requestToken = 0;
  let sending = false;

  const service = () => global.KSKSupabaseMessages;
  const language = () => global.KSKLanguage;
  const isEnglish = () => language()?.getLanguage?.() === "en";
  const t = (en, ne) => isEnglish() ? en : ne;

  function messageHost() {
    if (!conversation?.id) return null;

    return document.querySelector(
      `[data-saino-messages="${CSS.escape(conversation.id)}"]`
    );
  }

  function composer() {
    return document.querySelector("[data-saino-message-form]");
  }

  function getMessageText(message) {
    if (!message) return "";

    if (message.deletedAt || message.deletedForEveryone) {
      return t("This message was deleted", "यो सन्देश मेटाइएको छ");
    }

    const text = String(message.text || "").trim();
    if (text) return text;

    if (message.type === "image") return t("Photo", "फोटो");
    if (message.type === "video") return t("Video", "भिडियो");

    if (message.type === "file") {
      return message.mediaName || t("Document", "कागजात");
    }

    return t("Media message", "मिडिया सन्देश");
  }

  function clearSelection() {
    selectedMessage = null;

    document.querySelector(
      ".saino-reply-composer-preview"
    )?.remove();
  }

  function showComposerPreview(message) {
    const form = composer();
    if (!form) return;

    document.querySelector(
      ".saino-reply-composer-preview"
    )?.remove();

    const preview = document.createElement("div");
    preview.className = "saino-reply-composer-preview";

    const copy = document.createElement("div");
    copy.className = "saino-reply-preview-copy";

    const heading = document.createElement("strong");
    heading.textContent = t("Replying to", "जवाफ दिँदै");

    const excerpt = document.createElement("span");
    excerpt.textContent = getMessageText(message);

    copy.append(heading, excerpt);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "saino-reply-close";
    close.setAttribute(
      "aria-label",
      t("Cancel reply", "जवाफ हटाउनुहोस्")
    );
    close.textContent = "×";
    close.addEventListener("click", clearSelection);

    preview.append(copy, close);
    form.parentElement.insertBefore(preview, form);
  }

  function selectMessage(message) {
    if (!message?.id) return;

    selectedMessage = message;
    showComposerPreview(message);

    composer()?.querySelector('[name="message"]')?.focus();
  }

  function makeReplyButton(message) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "saino-message-reply-button";
    button.textContent = t("Reply", "जवाफ");
    button.setAttribute(
      "aria-label",
      t("Reply to message", "सन्देशको जवाफ दिनुहोस्")
    );

    button.addEventListener("click", () => {
      selectMessage(message);
    });

    return button;
  }

  function addQuotedPreview(row, message) {
    if (!message.replyToId) return;

    if (row.querySelector(".saino-message-quoted")) return;

    const original = messageMap.get(message.replyToId);
    const article = row.querySelector(".saino-message");
    const text = article?.querySelector(".saino-message-text");

    if (!article || !text) return;

    const quote = document.createElement("div");
    quote.className = "saino-message-quoted";

    const label = document.createElement("strong");

    label.textContent = original
      ? (original.fromMe
          ? t("You", "तपाईं")
          : t("Message", "सन्देश"))
      : t("Replied message", "जवाफ दिइएको सन्देश");

    const excerpt = document.createElement("span");

    excerpt.textContent = original
      ? getMessageText(original)
      : t(
          "Original message is not loaded",
          "मूल सन्देश लोड भएको छैन"
        );

    quote.append(label, excerpt);
    article.insertBefore(quote, text);
  }

  function decorateRows(messages) {
    const host = messageHost();
    if (!host) return;

    const rows = Array.from(
      host.querySelectorAll(".saino-message-row")
    );

    if (rows.length !== messages.length) return;

    rows.forEach((row, index) => {
      const message = messages[index];

      if (!message?.id) return;

      row.dataset.sainoMessageId = message.id;

      addQuotedPreview(row, message);

      if (!row.querySelector(".saino-message-reply-button")) {
        row.querySelector(".saino-message")?.appendChild(
          makeReplyButton(message)
        );
      }
    });
  }

  async function refreshMessages() {
    const active = conversation;
    const host = messageHost();
    const api = service();

    if (!active?.id || !host || !api?.getMessages) return;

    const token = ++requestToken;

    const result = await api.getMessages(
      active.id,
      { limit: 50 }
    );

    if (
      token !== requestToken ||
      !result?.ok ||
      !Array.isArray(result.data)
    ) return;

    messageMap = new Map(
      result.data.map(message => [message.id, message])
    );

    decorateRows(result.data);
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) {
      global.clearTimeout(refreshTimer);
    }

    refreshTimer = global.setTimeout(() => {
      refreshTimer = null;

      refreshMessages().catch(error => {
        console.warn("Saino reply UI:", error);
      });
    }, 160);
  }

  function observeApp() {
    if (observer) observer.disconnect();

    const root = document.getElementById("saino-app");

    if (!root || typeof MutationObserver === "undefined") return;

    observer = new MutationObserver(() => {
      scheduleRefresh();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  async function handleMessageSubmit(event) {
    const form = event.target.closest(
      "[data-saino-message-form]"
    );

    if (!form || !selectedMessage) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (sending || !conversation?.id) return;

    const textarea = form.querySelector('[name="message"]');
    const text = String(textarea?.value || "").trim();

    if (!text) return;

    const api = service();

    if (typeof api?.replyMessage !== "function") return;

    sending = true;

    const submit = form.querySelector('[type="submit"]');

    if (submit) submit.disabled = true;

    try {
      const result = await api.replyMessage(
        conversation.id,
        text,
        selectedMessage.id
      );

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          t("Could not send reply", "जवाफ पठाउन सकिएन")
        );
      }

      textarea.value = "";
      clearSelection();

      if (global.SainoApp?.refreshMessages) {
        await global.SainoApp.refreshMessages();
      }

      global.dispatchEvent(new CustomEvent("saino:reply-sent", {
        detail: {
          conversationId: conversation.id,
          message: result.data
        }
      }));

    } catch (error) {
      const preview = document.querySelector(
        ".saino-reply-composer-preview"
      );

      if (preview) {
        preview.dataset.error = "true";
        preview.title = error?.message || t(
          "Reply failed",
          "जवाफ पठाउन असफल"
        );
      }

      console.error("Saino reply send:", error);

    } finally {
      sending = false;

      if (submit?.isConnected) {
        submit.disabled = false;
      }
    }
  }

  function handleAppReady(event) {
    conversation = event.detail?.conversation || null;

    selectedMessage = null;
    messageMap.clear();
    requestToken++;

    document.querySelector(
      ".saino-reply-composer-preview"
    )?.remove();

    observeApp();
    scheduleRefresh();
  }

  function start() {
    global.addEventListener(
      "saino:app-ready",
      handleAppReady
    );

    global.addEventListener("ksk:auth-change", event => {
      if (!event.detail?.user) {
        conversation = null;
        selectedMessage = null;
        messageMap.clear();
        requestToken++;

        if (observer) observer.disconnect();
      }
    });

    global.addEventListener(
      "ksk:messages-cloud-change",
      event => {
        const action = event.detail?.action;

        if ([
          "message-sent",
          "message-edited",
          "message-deleted",
          "realtime-message"
        ].includes(action)) {
          scheduleRefresh();
        }
      }
    );

    document.addEventListener(
      "submit",
      handleMessageSubmit,
      true
    );
  }

  start();

  global.SainoMessageReplyUI = Object.freeze({
    refresh: scheduleRefresh,
    cancel: clearSelection
  });

})(window);
