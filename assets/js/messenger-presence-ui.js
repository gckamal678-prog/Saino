
/*
 * SAINO — MESSENGER PRESENCE UI
 * Shows online and typing status in the active conversation header.
 * Uses the existing KSKSupabaseMessages presence and typing APIs.
 */
(function (global) {
  "use strict";

  if (global.SainoMessengerPresenceUI) return;

  let activeConversationId = "";
  let currentUserId = "";
  let conversationMemberIds = new Set();
  let activeIsGroup = false;
  let onlineUserIds = new Set();
  let typingUserIds = new Set();
  const typingTimers = new Map();
  let stopTypingTimer = null;
  let startToken = 0;

  const messenger = () => global.KSKSupabaseMessages;
  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";
  const t = (en, ne) => isEnglish() ? en : ne;

  function getStatusElement() {
    return document.querySelector(
      ".saino-conversation .saino-contact-status"
    );
  }

  function clearTimers() {
    typingTimers.forEach(timer => global.clearTimeout(timer));
    typingTimers.clear();

    if (stopTypingTimer !== null) {
      global.clearTimeout(stopTypingTimer);
      stopTypingTimer = null;
    }
  }

  function setStatus(text, mode = "default") {
    const element = getStatusElement();
    if (!element) return;

    element.textContent = text;
    element.dataset.status = mode;
  }

  function renderStatus() {
    if (!activeConversationId) return;

    if (typingUserIds.size) {
      setStatus(
        typingUserIds.size > 1
          ? t("Several people are typing…", "केही साथीहरू लेख्दैछन्…")
          : t("typing…", "लेख्दैछन्…"),
        "typing"
      );
      return;
    }

    const count = onlineUserIds.size;

    if (count > 0) {
      setStatus(
        activeIsGroup && count > 1
          ? t(`${count} online`, `${count} जना अनलाइन`)
          : t("online", "अनलाइन"),
        "online"
      );
      return;
    }

    setStatus(t("Messages", "सन्देशहरू"), "offline");
  }

  function readPresenceUsers(state) {
    const ids = new Set();

    if (!state || typeof state !== "object") return ids;

    Object.values(state).forEach(entries => {
      const list = Array.isArray(entries) ? entries : [entries];

      list.forEach(entry => {
        const id = String(entry?.userId || "").trim();

        if (
          id &&
          id !== currentUserId &&
          (!conversationMemberIds.size || conversationMemberIds.has(id))
        ) {
          ids.add(id);
        }
      });
    });

    return ids;
  }

  async function stopActivePresence() {
    const service = messenger();
    const oldConversationId = activeConversationId;

    activeConversationId = "";
    onlineUserIds.clear();
    typingUserIds.clear();
    conversationMemberIds.clear();
    activeIsGroup = false;
    clearTimers();
    startToken++;

    if (service?.sendTyping && oldConversationId) {
      try {
        await service.sendTyping(oldConversationId, false);
      } catch (_) {}
    }

    if (service?.stopPresence) {
      await service.stopPresence();
    }
  }

  async function activateConversation(conversation, user) {
    const id = String(conversation?.id || "").trim();
    currentUserId = String(user?.id || "").trim();

    if (!id) {
      await stopActivePresence();
      return;
    }

    if (id !== activeConversationId) {
      await stopActivePresence();
      activeConversationId = id;
    }

    conversationMemberIds = new Set(
      (Array.isArray(conversation?.members) ? conversation.members : [])
        .map(member => String(member?.id || "").trim())
        .filter(memberId => memberId && memberId !== currentUserId)
    );

    activeIsGroup = conversation?.type === "group";

    const token = ++startToken;
    const service = messenger();

    if (!service?.startPresence) {
      setStatus(t("Messages", "सन्देशहरू"), "offline");
      return;
    }

    const ready = await service.startPresence(id);

    if (token !== startToken || id !== activeConversationId) return;

    if (!ready) {
      onlineUserIds.clear();
      renderStatus();
    }
  }

  function handlePresenceSync(event) {
    if (event.detail?.conversationId !== activeConversationId) return;

    onlineUserIds = readPresenceUsers(event.detail?.state);
    renderStatus();
  }

  function handleGlobalPresenceSync(event) {
    onlineUserIds = readPresenceUsers(event.detail?.state);
    renderStatus();
  }

  function handleTypingChange(event) {
    const detail = event.detail || {};

    if (detail.conversationId !== activeConversationId) return;

    const userId = String(detail.userId || "").trim();

    if (!userId || userId === currentUserId) return;

    if (detail.typing) {
      typingUserIds.add(userId);

      const oldTimer = typingTimers.get(userId);

      if (oldTimer !== undefined) {
        global.clearTimeout(oldTimer);
      }

      const timer = global.setTimeout(() => {
        typingUserIds.delete(userId);
        typingTimers.delete(userId);
        renderStatus();
      }, 4500);

      typingTimers.set(userId, timer);
    } else {
      typingUserIds.delete(userId);

      const timer = typingTimers.get(userId);

      if (timer !== undefined) {
        global.clearTimeout(timer);
      }

      typingTimers.delete(userId);
    }

    renderStatus();
  }

  function sendTypingState(typing) {
    const service = messenger();
    const id = activeConversationId;

    if (!id || !service?.sendTyping) return;

    service.sendTyping(id, Boolean(typing)).catch(() => {});
  }

  function handleComposerInput(event) {
    const field = event.target.closest(
      '[data-saino-message-form] textarea[name="message"]'
    );

    if (!field || !activeConversationId) return;

    const hasText = Boolean(String(field.value || "").trim());

    if (!hasText) {
      if (stopTypingTimer !== null) {
        global.clearTimeout(stopTypingTimer);
        stopTypingTimer = null;
      }

      sendTypingState(false);
      return;
    }

    sendTypingState(true);

    if (stopTypingTimer !== null) {
      global.clearTimeout(stopTypingTimer);
    }

    stopTypingTimer = global.setTimeout(() => {
      sendTypingState(false);
      stopTypingTimer = null;
    }, 1800);
  }

  function handleComposerFocusOut(event) {
    const field = event.target.closest(
      '[data-saino-message-form] textarea[name="message"]'
    );

    if (!field) return;

    if (stopTypingTimer !== null) {
      global.clearTimeout(stopTypingTimer);
      stopTypingTimer = null;
    }

    sendTypingState(false);
  }

  function handleMessageChange(event) {
    if (
      event.detail?.action === "message-sent" &&
      event.detail?.conversationId === activeConversationId
    ) {
      if (stopTypingTimer !== null) {
        global.clearTimeout(stopTypingTimer);
        stopTypingTimer = null;
      }

      sendTypingState(false);
    }
  }

  function start() {
    global.addEventListener("saino:app-ready", event => {
      activateConversation(
        event.detail?.conversation || null,
        event.detail?.user || null
      );
    });

    global.addEventListener("ksk:auth-change", event => {
      if (!event.detail?.user) {
        stopActivePresence();
        currentUserId = "";
      }
    });

    global.addEventListener("ksk:messages-cloud-change", event => {
      if (event.detail?.action === "presence-sync") {
        handlePresenceSync(event);
      } else if (event.detail?.action === "global-presence-sync") {
        handleGlobalPresenceSync(event);
      } else if (event.detail?.action === "typing-change") {
        handleTypingChange(event);
      }

      handleMessageChange(event);
    });

    document.addEventListener("input", handleComposerInput);
    document.addEventListener("focusout", handleComposerFocusOut);

    global.addEventListener("offline", () => {
      onlineUserIds.clear();
      typingUserIds.clear();
      renderStatus();
    });
  }

  start();

  global.SainoMessengerPresenceUI = Object.freeze({
    refresh: renderStatus,
    stop: stopActivePresence
  });

})(window);
