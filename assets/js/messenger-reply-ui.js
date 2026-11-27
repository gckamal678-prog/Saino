
/*
 * SAINO — WHATSAPP STYLE MESSAGE REPLY UI
 * Swipe right to reply, quote preview and reply composer.
 * Uses the existing KSKSupabaseMessages.replyMessage API.
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
  let pointerStart = null;

  const SWIPE_THRESHOLD = 65;
  const SWIPE_MAX = 105;

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

    const value = String(message.text || "").trim();

    if (value) return value;

    if (message.type === "image") return t("Photo", "फोटो");
    if (message.type === "video") return t("Video", "भिडियो");

    if (message.type === "file") {
      return message.mediaName || t("Document", "कागजात");
    }

    return t("Media message", "मिडिया सन्देश");
  }

  function getMessageAuthor(message) {
    if (!message) {
      return t("Message", "सन्देश");
    }

    if (message.fromMe) {
      return t("You", "तपाईं");
    }

    return t("Reply", "जवाफ");
  }

  function clearSelection() {
    selectedMessage = null;

    document.querySelector(
      ".saino-reply-composer-preview"
    )?.remove();

    document.querySelectorAll(
      ".saino-message-row.saino-reply-selected"
    ).forEach(row => {
      row.classList.remove("saino-reply-selected");
    });
  }

  function showComposerPreview(message) {
    const form = composer();
    if (!form) return;

    document.querySelector(
      ".saino-reply-composer-preview"
    )?.remove();

    const preview = document.createElement("div");
    preview.className = "saino-reply-composer-preview";

    const accent = document.createElement("span");
    accent.className = "saino-reply-preview-accent";

    const copy = document.createElement("div");
    copy.className = "saino-reply-preview-copy";

    const heading = document.createElement("strong");
    heading.textContent =
      `${t("Replying to", "जवाफ दिँदै")} ${getMessageAuthor(message)}`;

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

    preview.append(accent, copy, close);
    form.parentElement.insertBefore(preview, form);
  }

  function selectMessage(message) {
    if (!message?.id) return;

    clearSelection();

    selectedMessage = message;

    const row = messageHost()?.querySelector(
      `[data-saino-message-id="${CSS.escape(String(message.id))}"]`
    );

    row?.classList.add("saino-reply-selected");

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

    button.addEventListener("click", event => {
      event.stopPropagation();
      selectMessage(message);
    });

    return button;
  }

  function scrollToOriginal(messageId) {
    if (!messageId) return;

    const host = messageHost();

    const row = host?.querySelector(
      `[data-saino-message-id="${CSS.escape(String(messageId))}"]`
    );

    if (!row) return;

    row.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    row.classList.add("saino-reply-original-highlight");

    global.setTimeout(() => {
      row.classList.remove("saino-reply-original-highlight");
    }, 1500);
  }

  function addQuotedPreview(row, message) {
    if (!message.replyToId) return;

    const article = row.querySelector(".saino-message");
    const text = article?.querySelector(".saino-message-text");

    if (!article || !text) return;

    const original = messageMap.get(message.replyToId);

    let quote = article.querySelector(".saino-message-quoted");

    if (!quote) {
      quote = document.createElement("button");
      quote.type = "button";
      quote.className = "saino-message-quoted";
      quote.setAttribute(
        "aria-label",
        t("View original message", "मूल सन्देश हेर्नुहोस्")
      );

      article.insertBefore(quote, text);
    }

    /* पुरानो placeholder भए पनि वास्तविक Preview राख्ने */
    quote.replaceChildren();

    const label = document.createElement("strong");
    label.textContent = original
      ? getMessageAuthor(original)
      : t("Replied message", "जवाफ दिइएको सन्देश");

    const excerpt = document.createElement("span");
    excerpt.textContent = original
      ? getMessageText(original)
      : t(
          "Original message is not loaded",
          "मूल सन्देश लोड भएको छैन"
        );

    quote.append(label, excerpt);

    quote.onclick = event => {
      event.stopPropagation();
      scrollToOriginal(message.replyToId);
    };
  }

  function decorateRows(messages) {
    const host = messageHost();
    if (!host) return;

    const rows = Array.from(
      host.querySelectorAll(":scope > .saino-message-row")
    );

    if (rows.length !== messages.length) return;

    rows.forEach((row, index) => {
      const message = messages[index];

      if (!message?.id) return;

      row.dataset.messageId = message.id;
      row.dataset.sainoMessageId = message.id;

      /* Horizontal swipe, vertical scrolling कायम */
      row.style.touchAction = "pan-y";

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
      result.data.map(message => [String(message.id), message])
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
    }, 180);
  }

  /* -------------------------
     SWIPE TO REPLY
     ------------------------- */

  function isInteractiveTarget(target) {
    return Boolean(target.closest(
      "button,a,input,textarea,video,audio,select"
    ));
  }

  function handlePointerDown(event) {
    const row = event.target.closest(".saino-message-row");

    if (!row || !messageHost()?.contains(row)) return;
    if (isInteractiveTarget(event.target)) return;

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    pointerStart = {
      row,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      swiping: false
    };
  }

  function handlePointerMove(event) {
    if (!pointerStart) return;

    if (event.pointerId !== pointerStart.pointerId) return;

    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;

    /* Vertical scroll लाई प्राथमिकता */
    if (
      !pointerStart.swiping &&
      Math.abs(dy) > Math.abs(dx)
    ) {
      pointerStart = null;
      return;
    }

    if (dx <= 0) return;

    if (dx > 12) {
      pointerStart.swiping = true;
      pointerStart.row.classList.add("saino-reply-swiping");
    }

    if (pointerStart.swiping) {
      const distance = Math.min(dx, SWIPE_MAX);

      pointerStart.row.style.transform =
        `translateX(${distance * 0.35}px)`;

      pointerStart.row.style.transition = "none";
    }
  }

  function resetSwipe(row) {
    if (!row) return;

    row.style.transform = "";
    row.style.transition = "";

    row.classList.remove("saino-reply-swiping");
  }

  function handlePointerUp(event) {
    if (!pointerStart) return;

    if (event.pointerId !== pointerStart.pointerId) return;

    const state = pointerStart;
    pointerStart = null;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;

    resetSwipe(state.row);

    if (
      state.swiping &&
      dx >= SWIPE_THRESHOLD &&
      dx > Math.abs(dy)
    ) {
      const id =
        state.row.dataset.sainoMessageId ||
        state.row.dataset.messageId;

      const message = messageMap.get(String(id));

      if (message) {
        event.preventDefault();
        selectMessage(message);
      }
    }
  }

  function handlePointerCancel() {
    if (!pointerStart) return;

    resetSwipe(pointerStart.row);
    pointerStart = null;
  }

  function bindSwipe() {
    const host = messageHost();
    if (!host || host.dataset.sainoReplySwipeBound) return;

    host.dataset.sainoReplySwipeBound = "true";

    host.addEventListener("pointerdown", handlePointerDown);
    host.addEventListener("pointermove", handlePointerMove, {
      passive: true
    });
    host.addEventListener("pointerup", handlePointerUp);
    host.addEventListener("pointercancel", handlePointerCancel);
    host.addEventListener("lostpointercapture", handlePointerCancel);
  }

  /* -------------------------
     SEND REPLY
     ------------------------- */

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

      scheduleRefresh();

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

    pointerStart = null;

    document.querySelector(
      ".saino-reply-composer-preview"
    )?.remove();

    observeApp();
    scheduleRefresh();

    global.setTimeout(bindSwipe, 100);
  }

  function observeApp() {
    if (observer) observer.disconnect();

    const root = document.getElementById("saino-app");

    if (!root || typeof MutationObserver === "undefined") return;

    observer = new MutationObserver(() => {
      bindSwipe();
      scheduleRefresh();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
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
        pointerStart = null;

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

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && selectedMessage) {
        clearSelection();
      }
    });
  }

  start();

  global.SainoMessageReplyUI = Object.freeze({
    refresh: scheduleRefresh,
    cancel: clearSelection,
    replyTo: selectMessage
  });

})(window);
