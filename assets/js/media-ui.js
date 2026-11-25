
/* Saino Messenger Media UI: image, video and document sharing. */
(function (global) {
  "use strict";

  if (global.SainoMediaUI) return;

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

  let observer = null;
  let uploading = false;
  const decorateQueue = new WeakSet();

  const language = () => global.KSKLanguage;
  const isEnglish = () => language()?.getLanguage?.() === "en";
  const messenger = () => global.KSKSupabaseMessages;
  const app = () => global.SainoApp;

  function words(en, ne) {
    return isEnglish() ? en : ne;
  }

  function toast(message, isError = false) {
    let host = document.querySelector(".saino-toast-container");

    if (!host) {
      host = document.createElement("div");
      host.className = "saino-toast-container";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }

    const item = document.createElement("div");
    item.className =
      `saino-toast ${isError ? "error" : "success"}`;
    item.textContent = message;

    host.appendChild(item);

    global.setTimeout(() => {
      item.remove();
      if (!host.childElementCount) host.remove();
    }, 3500);
  }

  function formatSize(bytes) {
    const size = Number(bytes);

    if (!Number.isFinite(size) || size < 0) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function safeURL(value) {
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

  /* ATTACHMENT BUTTON */

  function injectComposer() {
    const form = document.querySelector(
      "[data-saino-message-form]"
    );

    if (!form || form.querySelector("[data-saino-media-attach]")) {
      return;
    }

    const field = form.querySelector(".saino-composer-field");
    if (!field) return;

    const input = document.createElement("input");

    input.type = "file";
    input.accept = [
      "image/jpeg,image/png,image/webp,image/gif",
      "video/mp4,video/webm",
      ".pdf,.txt,.doc,.docx"
    ].join(",");

    input.hidden = true;
    input.tabIndex = -1;
    input.dataset.sainoMediaInput = "true";

    const button = document.createElement("button");

    button.type = "button";
    button.className = "saino-media-attach-button";
    button.dataset.sainoMediaAttach = "true";
    button.textContent = "＋";

    button.title = words(
      "Attach photo, video or file",
      "फोटो, भिडियो वा फाइल जोड्नुहोस्"
    );

    button.setAttribute("aria-label", button.title);

    field.insertAdjacentElement("beforebegin", button);
    form.appendChild(input);
  }

  /* MEDIA DISPLAY */

  function createMediaElement(message, url) {
    const safe = safeURL(url);
    if (!safe) return null;

    const wrap = document.createElement("div");
    wrap.className = "saino-message-media";

    const mime = String(message.mediaMime || "");

    if (
      message.type === "image" ||
      mime.startsWith("image/")
    ) {
      const image = document.createElement("img");

      image.src = safe;
      image.alt = message.mediaName || "Shared image";
      image.loading = "lazy";
      image.decoding = "async";

      image.addEventListener("click", () => {
        global.open(safe, "_blank", "noopener");
      });

      wrap.appendChild(image);
      return wrap;
    }

    if (
      message.type === "video" ||
      mime.startsWith("video/")
    ) {
      const video = document.createElement("video");

      video.src = safe;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";

      video.setAttribute(
        "aria-label",
        message.mediaName || "Shared video"
      );

      wrap.appendChild(video);
      return wrap;
    }

    const link = document.createElement("a");

    link.className = "saino-message-file-link";
    link.href = safe;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = message.mediaName || "saino-file";

    const name = document.createElement("span");

    name.className = "saino-message-file-name";
    name.textContent =
      `📄 ${message.mediaName || words(
        "Shared file",
        "साझा गरिएको फाइल"
      )}`;

    const size = document.createElement("small");
    size.textContent = formatSize(message.mediaSize);

    link.append(name, size);
    wrap.appendChild(link);

    return wrap;
  }

  async function decorateMessages(host) {
    if (!host || decorateQueue.has(host)) return;

    const rows = Array.from(
      host.querySelectorAll(":scope > .saino-message-row")
    );

    if (!rows.length) return;

    if (rows.every(row => row.dataset.sainoMediaMessageId)) {
      return;
    }

    decorateQueue.add(host);

    try {
      const conversationId =
        host.getAttribute("data-saino-messages");

      const service = messenger();

      if (
        !conversationId ||
        !service?.getMessages ||
        !service?.getMediaUrl
      ) {
        return;
      }

      const result = await service.getMessages(
        conversationId,
        { limit: 50 }
      );

      if (!result?.ok || !Array.isArray(result.data)) {
        return;
      }

      const messages = result.data;

      const visibleRows = Array.from(
        host.querySelectorAll(":scope > .saino-message-row")
      );

      const offset = Math.max(
        0,
        messages.length - visibleRows.length
      );

      for (let index = 0; index < visibleRows.length; index++) {
        const row = visibleRows[index];
        const message = messages[offset + index];

        if (!message) continue;

        row.dataset.sainoMediaMessageId =
          String(message.id || "");

        if (
          !message.mediaPath ||
          message.deletedAt ||
          message.deletedForEveryone ||
          row.querySelector(".saino-message-media")
        ) {
          continue;
        }

        const urlResult = await service.getMediaUrl(
          message.mediaPath,
          3600
        );

        if (!urlResult?.ok || !urlResult.data) continue;

        const media = createMediaElement(
          message,
          urlResult.data
        );

        const bubble = row.querySelector(".saino-message");
        const text = row.querySelector(".saino-message-text");

        if (media && bubble) {
          if (text && !text.textContent.trim()) {
            text.remove();
          }

          const meta = bubble.querySelector(
            ".saino-message-meta"
          );

          if (meta) {
            bubble.insertBefore(media, meta);
          } else {
            bubble.appendChild(media);
          }
        }
      }
    } catch (error) {
      console.warn("Saino media display failed:", error);
    } finally {
      decorateQueue.delete(host);
    }
  }

  async function decorateAllMessages() {
    document.querySelectorAll(
      ".saino-messages[data-saino-messages]"
    ).forEach(host => decorateMessages(host));
  }

  /* WATCH APP DOM */

  function observe() {
    if (observer || !document.body) return;

    observer = new MutationObserver(() => {
      injectComposer();
      decorateAllMessages();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    injectComposer();
    decorateAllMessages();
  }

  /* FILE UPLOAD */

  async function handleFile(file, input, button) {
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast(words(
        "This file type is not supported. Choose an image, MP4/WebM video, PDF, TXT, DOC or DOCX.",
        "यो फाइल प्रकार मिलेन। फोटो, MP4/WebM भिडियो, PDF, TXT, DOC वा DOCX छान्नुहोस्।"
      ), true);

      input.value = "";
      return;
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      toast(words(
        "File must be smaller than 50 MB.",
        "फाइल ५० MB भन्दा सानो हुनुपर्छ।"
      ), true);

      input.value = "";
      return;
    }

    const conversation = app()?.getActiveConversation?.();

    if (!conversation?.id) {
      toast(words(
        "Open a conversation first.",
        "पहिले कुराकानी खोल्नुहोस्।"
      ), true);

      input.value = "";
      return;
    }

    if (uploading) return;

    uploading = true;

    button.disabled = true;
    button.textContent = "…";

    try {
      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";

      const result = await messenger().uploadMedia(
        conversation.id,
        file,
        type
      );

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          words("Upload failed.", "अपलोड हुन सकेन।")
        );
      }

      input.value = "";

      toast(words(
        "File sent.",
        "फाइल पठाइयो।"
      ));

      await app()?.refreshMessages?.();

    } catch (error) {
      toast(
        error?.message ||
        words(
          "File could not be sent.",
          "फाइल पठाउन सकिएन।"
        ),
        true
      );

    } finally {
      uploading = false;

      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "＋";
      }
    }
  }

  /* EVENTS */

  document.addEventListener("click", event => {
    const button = event.target.closest(
      "[data-saino-media-attach]"
    );

    if (!button) return;

    const input = button.closest("form")
      ?.querySelector("[data-saino-media-input]");

    input?.click();
  });

  document.addEventListener("change", event => {
    const input = event.target.closest(
      "[data-saino-media-input]"
    );

    if (!input) return;

    const button = input.closest("form")
      ?.querySelector("[data-saino-media-attach]");

    handleFile(
      input.files?.[0],
      input,
      button || input
    ).catch(error => {
      console.error("Saino media upload failed:", error);
    });
  });

  global.addEventListener(
    "ksk:messages-cloud-change",
    event => {
      const action = event.detail?.action;

      if ([
        "message-sent",
        "realtime-message",
        "message-deleted"
      ].includes(action)) {
        global.setTimeout(decorateAllMessages, 0);
      }
    }
  );

  global.addEventListener("saino:app-ready", () => {
    injectComposer();
    decorateAllMessages();
  });

  global.SainoMediaUI = Object.freeze({
    initialize: observe,
    refresh: decorateAllMessages
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      observe,
      { once: true }
    );
  } else {
    observe();
  }

})(window);
