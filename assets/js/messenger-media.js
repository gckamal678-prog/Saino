
/*
 * SAINO — MESSENGER MEDIA UI
 * Photo, video and document sharing.
 * Uses the existing KSKSupabaseMessages media API.
 *
 * Voice recording, audio messages and TXT files are excluded.
 */
(function (global) {
  "use strict";

  if (global.SainoMessengerMedia) return;

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

  const ALLOWED_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "webp", "gif",
    "mp4", "webm", "pdf", "doc", "docx"
  ]);

  let activeConversationId = "";
  let uploading = false;
  let observer = null;
  let decorateTimer = null;
  let currentHost = null;

  const messenger = () => global.KSKSupabaseMessages;

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const t = (en, ne) => isEnglish() ? en : ne;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showToast(message, type = "success") {
    let host = document.querySelector(".saino-toast-container");

    if (!host) {
      host = document.createElement("div");
      host.className = "saino-toast-container";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      document.body.appendChild(host);
    }

    const toast = document.createElement("div");
    toast.className =
      `saino-toast ${type === "error" ? "error" : "success"}`;

    toast.textContent = message;
    host.appendChild(toast);

    global.setTimeout(() => {
      toast.remove();

      if (!host.childElementCount) {
        host.remove();
      }
    }, 3500);
  }

  function fileExtension(file) {
    const name = String(file?.name || "");
    const dot = name.lastIndexOf(".");

    return dot >= 0
      ? name.slice(dot + 1).toLowerCase()
      : "";
  }

  function validateFile(file) {
    if (!file) {
      throw new Error(
        t("Choose a file first.", "पहिले फाइल छान्नुहोस्।")
      );
    }

    if (file.size <= 0) {
      throw new Error(
        t("This file is empty.", "यो फाइल खाली छ।")
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        t(
          "File size must be 50 MB or less.",
          "फाइल ५० MB वा सोभन्दा कम हुनुपर्छ।"
        )
      );
    }

    const mime = String(file.type || "").toLowerCase();
    const extension = fileExtension(file);

    const validMime =
      ALLOWED_MIME.has(mime) ||
      mime === "" ||
      mime === "application/octet-stream";

    const validExtension =
      ALLOWED_EXTENSIONS.has(extension);

    if (!validMime || !validExtension) {
      throw new Error(
        t(
          "This file type is not supported. Choose an image, video, PDF or document.",
          "यो फाइल प्रकार समर्थित छैन। फोटो, भिडियो, PDF वा Document छान्नुहोस्।"
        )
      );
    }

    return true;
  }

  function getComposer() {
    return document.querySelector(
      "[data-saino-message-form]"
    );
  }

  function ensureComposerControls() {
    const form = getComposer();

    if (!form || form.querySelector("[data-media-picker]")) {
      return;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.className = "saino-media-button";
    button.dataset.mediaPicker = "true";
    button.title = t(
      "Attach a file",
      "फाइल जोड्नुहोस्"
    );
    button.setAttribute("aria-label", button.title);
    button.textContent = "＋";

    const input = document.createElement("input");

    input.type = "file";

    input.accept = [
      "image/jpeg,image/png,image/webp,image/gif",
      "video/mp4,video/webm",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.doc,.docx"
    ].join(",");

    input.hidden = true;
    input.dataset.mediaInput = "true";
    input.multiple = false;
    input.tabIndex = -1;

    button.addEventListener("click", () => {
      if (!uploading) {
        input.click();
      }
    });

    input.addEventListener(
      "change",
      handleFileSelection
    );

    form.insertBefore(button, form.firstChild);
    form.appendChild(input);
  }

  async function handleFileSelection(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    try {
      validateFile(file);

      if (!activeConversationId) {
        throw new Error(
          t(
            "Open a conversation first.",
            "पहिले कुराकानी खोल्नुहोस्।"
          )
        );
      }

      const service = messenger();

      if (typeof service?.uploadMedia !== "function") {
        throw new Error(
          t(
            "Media service is unavailable.",
            "Media सेवा उपलब्ध छैन।"
          )
        );
      }

      uploading = true;
      updateComposerState();

      showToast(
        t("Uploading file…", "फाइल पठाउँदैछ…"),
        "success"
      );

      const result = await service.uploadMedia(
        activeConversationId,
        file
      );

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          t(
            "File could not be sent.",
            "फाइल पठाउन सकिएन।"
          )
        );
      }

      showToast(
        t(
          "File sent successfully.",
          "फाइल सफलतापूर्वक पठाइयो।"
        )
      );

      scheduleDecorate();

    } catch (error) {
      showToast(
        error?.message ||
        t(
          "File could not be sent.",
          "फाइल पठाउन सकिएन।"
        ),
        "error"
      );
    } finally {
      uploading = false;
      input.value = "";
      updateComposerState();
    }
  }

  function updateComposerState() {
    const button = document.querySelector(
      "[data-media-picker]"
    );

    if (!button) return;

    button.disabled = uploading;
    button.textContent = uploading ? "…" : "＋";

    button.title = uploading
      ? t("Uploading…", "अपलोड हुँदैछ…")
      : t("Attach a file", "फाइल जोड्नुहोस्");
  }

  function formatFileSize(size) {
    const value = Number(size) || 0;

    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function safeMediaURL(value) {
    try {
      const url = new URL(String(value || ""));

      return (
        url.protocol === "https:" ||
        url.protocol === "http:"
      ) ? url.href : "";

    } catch (_) {
      return "";
    }
  }

  async function createMediaElement(message) {
    const service = messenger();

    const result = await service.getMediaUrl(
      message.mediaPath
    );

    if (!result?.ok || !result.data) {
      const unavailable = document.createElement("div");

      unavailable.className = "saino-media-unavailable";
      unavailable.textContent = t(
        "Media is unavailable.",
        "Media उपलब्ध छैन।"
      );

      return unavailable;
    }

    const url = safeMediaURL(result.data);

    if (!url) {
      const unavailable = document.createElement("div");

      unavailable.className = "saino-media-unavailable";
      unavailable.textContent = t(
        "Could not open this media.",
        "यो Media खोल्न सकिएन।"
      );

      return unavailable;
    }

    const type = String(
      message.type || ""
    ).toLowerCase();

    const mime = String(
      message.mediaMime || ""
    ).toLowerCase();

    const name = String(
      message.mediaName || "Attachment"
    );

    const size = formatFileSize(
      message.mediaSize
    );

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
    icon.textContent =
      mime === "application/pdf" ? "PDF" : "FILE";

    const details = document.createElement("span");
    details.className = "saino-media-file-details";

    const title = document.createElement("strong");
    title.textContent = name;

    const meta = document.createElement("small");
    meta.textContent = size;

    details.append(title, meta);
    link.append(icon, details);

    return link;
  }

  async function decorateMessages(host, conversationId) {
    if (!host || !conversationId || !host.isConnected) {
      return;
    }

    const service = messenger();

    if (!service?.getMessages || !service?.getMediaUrl) {
      return;
    }

    const result = await service.getMessages(
      conversationId,
      { limit: 50 }
    );

    if (!result?.ok || !Array.isArray(result.data)) {
      return;
    }

    if (
      !host.isConnected ||
      conversationId !== activeConversationId
    ) {
      return;
    }

    const messages = result.data;

    const rows = [
      ...host.querySelectorAll(".saino-message-row")
    ];

    const offset = Math.max(
      0,
      messages.length - rows.length
    );

    for (let index = 0; index < rows.length; index += 1) {
      const message = messages[offset + index];

      const article = rows[index].querySelector(
        ".saino-message"
      );

      if (
        !message ||
        !article ||
        article.dataset.mediaDecorated === "true"
      ) {
        continue;
      }

      article.dataset.mediaDecorated = "true";

      if (
        message.deletedAt ||
        message.deletedForEveryone ||
        !message.mediaPath
      ) {
        continue;
      }

      const content = await createMediaElement(message);

      if (!article.isConnected) {
        continue;
      }

      const textNode = article.querySelector(
        ".saino-message-text"
      );

      if (textNode) {
        textNode.insertAdjacentElement(
          "afterend",
          content
        );
      } else {
        article.insertBefore(
          content,
          article.firstChild
        );
      }
    }
  }

  function scheduleDecorate() {
    if (decorateTimer) {
      global.clearTimeout(decorateTimer);
    }

    decorateTimer = global.setTimeout(() => {
      decorateTimer = null;

      const host = document.querySelector(
        ".saino-messages"
      );

      if (!host || !activeConversationId) {
        return;
      }

      decorateMessages(
        host,
        activeConversationId
      ).catch(error => {
        console.warn(
          "Saino media render failed:",
          error
        );
      });

    }, 180);
  }

  function observeMessages() {
    const host = document.querySelector(
      ".saino-messages"
    );

    if (!host) {
      currentHost = null;

      if (observer) {
        observer.disconnect();
      }

      return;
    }

    if (host === currentHost) {
      return;
    }

    currentHost = host;

    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      scheduleDecorate();
    });

    observer.observe(host, {
      childList: true,
      subtree: true
    });

    scheduleDecorate();
  }

  function onAppReady(event) {
    activeConversationId = String(
      event.detail?.conversation?.id || ""
    );

    ensureComposerControls();
    observeMessages();
  }

  function init() {
    global.addEventListener(
      "saino:app-ready",
      onAppReady
    );

    global.addEventListener(
      "ksk:messages-cloud-change",
      event => {
        const action = event.detail?.action;

        if (
          activeConversationId &&
          [
            "message-sent",
            "realtime-message"
          ].includes(action)
        ) {
          scheduleDecorate();
        }
      }
    );

    const root = document.getElementById("saino-app");

    if (root) {
      const appObserver = new MutationObserver(() => {
        ensureComposerControls();
        observeMessages();
      });

      appObserver.observe(root, {
        childList: true,
        subtree: true
      });
    }

    ensureComposerControls();
    observeMessages();
  }

  global.SainoMessengerMedia = {
    initialize: init
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }

})(window);
