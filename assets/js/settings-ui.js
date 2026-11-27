
/* Saino Settings UI — account, language, notifications and chat preferences. */
(function (global) {
  "use strict";

  if (global.SainoSettingsUI) return;

  const api = () => global.KSKSupabaseSettings;
  const push = () => global.KSKSupabasePush;
  const auth = () => global.KSKSupabaseAuth;
  const overlayId = "saino-settings-overlay";

  let settings = {};
  let activeTab = "general";
  let userId = "";
  let busy = false;
  let pushStatus = null;
  let saveQueue = Promise.resolve();

  const english = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const tr = (en, ne) => english() ? en : ne;

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function normalize(value) {
    const source =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};

    return {
      ...source,
      general: {
        ...(source.general || {}),
        language: ["ne", "en"].includes(source.general?.language)
          ? source.general.language
          : global.KSKLanguage?.getLanguage?.() || "ne"
      },
      chat: {
        ...(source.chat || {}),
        enterToSend: source.chat?.enterToSend === true
      }
    };
  }

  function notify(message, type = "success") {
    let host = document.querySelector(".saino-toast-container");

    if (!host) {
      host = document.createElement("div");
      host.className = "saino-toast-container";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }

    const item = document.createElement("div");
    item.className =
      `saino-toast ${type === "error" ? "error" : "success"}`;
    item.textContent = String(message || "");

    host.appendChild(item);

    global.setTimeout(() => {
      item.remove();
      if (!host.childElementCount) host.remove();
    }, 3200);
  }

  function root() {
    return document.getElementById(overlayId);
  }

  function content() {
    return root()?.querySelector("[data-settings-content]");
  }

  function ensureOverlay() {
    if (root()) return root();

    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.className = "saino-settings-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
      <section
        class="saino-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saino-settings-title"
      >
        <header class="saino-settings-header">
          <div>
            <p class="saino-settings-eyebrow">SAINO</p>
            <h2 id="saino-settings-title">
              ${tr("Settings", "सेटिङ्स")}
            </h2>
          </div>

          <button
            type="button"
            class="saino-settings-close"
            data-settings-action="close"
            aria-label="${tr("Close", "बन्द गर्नुहोस्")}"
          >×</button>
        </header>

        <nav class="saino-settings-tabs"
          aria-label="${tr("Settings sections", "सेटिङका भागहरू")}">
          <button type="button" data-settings-tab="general">
            ${tr("General", "सामान्य")}
          </button>
          <button type="button" data-settings-tab="notifications">
            ${tr("Notifications", "सूचनाहरू")}
          </button>
          <button type="button" data-settings-tab="chat">
            ${tr("Chat", "च्याट")}
          </button>
          <button type="button" data-settings-tab="privacy">
            ${tr("Privacy", "गोपनीयता")}
          </button>
        </nav>

        <div
          class="saino-settings-content"
          data-settings-content
          aria-live="polite"
        ></div>
      </section>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function injectNavigation() {
    const nav = document.querySelector(".saino-tabs");

    if (!nav || nav.querySelector("[data-saino-settings-open]")) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "saino-tab";
    button.dataset.sainoSettingsOpen = "true";
    button.textContent = tr("Settings", "सेटिङ्स");
    button.setAttribute(
      "aria-label",
      tr("Open settings", "सेटिङ्स खोल्नुहोस्")
    );

    nav.appendChild(button);
  }

  async function loadSettings() {
    if (!api()?.loadMySettings) {
      throw new Error(
        tr("Settings service is unavailable.", "सेटिङ सेवा उपलब्ध छैन।")
      );
    }

    const result = await api().loadMySettings();
    settings = normalize(result?.settings);
  }

  function savePatch(section, patch) {
    settings = normalize(settings);

    settings[section] = {
      ...settings[section],
      ...patch
    };

    const snapshot = JSON.parse(JSON.stringify(settings));

    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        const result = await api().saveMySettings(snapshot);
        settings = normalize(result?.settings || snapshot);
        return result;
      });

    return saveQueue;
  }

  function renderLoading() {
    const node = content();
    if (!node) return;

    node.innerHTML = `
      <div class="saino-settings-loading">
        ${tr("Loading settings…", "सेटिङ लोड हुँदैछ…")}
      </div>
    `;
  }

  function render() {
    const overlay = root();

    if (!overlay || overlay.hidden) return;

    overlay.querySelectorAll("[data-settings-tab]").forEach(button => {
      const active = button.dataset.settingsTab === activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    const node = content();
    if (!node) return;

    if (activeTab === "general") {
      renderGeneral(node);
    } else if (activeTab === "notifications") {
      renderNotifications(node);
    } else if (activeTab === "chat") {
      renderChat(node);
    } else {
      renderPrivacy(node);
    }
  }

  function renderGeneral(node) {
    const email = auth()?.getUser?.()?.email || "";
    const language = settings.general.language || "ne";

    node.innerHTML = `
      <section class="saino-settings-section">
        <h3>${tr("Account", "खाता")}</h3>

        <div class="saino-settings-row">
          <div>
            <strong>${tr("Email address", "इमेल ठेगाना")}</strong>
            <p>${esc(email || tr("Not available", "उपलब्ध छैन"))}</p>
          </div>
          <span class="saino-settings-readonly">
            ${tr("Account", "खाता")}
          </span>
        </div>
      </section>

      <section class="saino-settings-section">
        <h3>${tr("Language", "भाषा")}</h3>

        <p class="saino-settings-description">
          ${tr(
            "Choose the language used throughout Saino.",
            "Saino मा प्रयोग हुने भाषा छान्नुहोस्।"
          )}
        </p>

        <label class="saino-settings-field">
          <span>${tr("App language", "एपको भाषा")}</span>

          <select name="settings-language" data-settings-language>
            <option value="ne" ${language === "ne" ? "selected" : ""}>
              नेपाली
            </option>
            <option value="en" ${language === "en" ? "selected" : ""}>
              English
            </option>
          </select>
        </label>

        <p class="saino-settings-hint">
          ${tr(
            "Your language choice is saved to your account.",
            "तपाईंको भाषा छनोट खातामा सुरक्षित हुन्छ।"
          )}
        </p>
      </section>
    `;
  }

  function renderNotifications(node) {
    const supported = Boolean(
      pushStatus?.ok &&
      pushStatus.data &&
      pushStatus.data.subscribed !== undefined
    );

    const subscribed = Boolean(pushStatus?.data?.subscribed);
    const permission = pushStatus?.data?.permission || "unknown";

    node.innerHTML = `
      <section class="saino-settings-section">
        <h3>${tr("Push notifications", "Push सूचनाहरू")}</h3>

        <p class="saino-settings-description">
          ${tr(
            "Receive notifications from Saino when browser Push is configured.",
            "ब्राउजर Push सुविधा जडान भएको अवस्थामा Saino का सूचनाहरू प्राप्त गर्नुहोस्।"
          )}
        </p>

        ${
          !supported
            ? `
              <div class="saino-settings-notice">
                ${esc(
                  pushStatus?.message ||
                  tr("Push notifications are not available.", "Push सूचना अहिले उपलब्ध छैन।")
                )}
              </div>
            `
            : `
              <div class="saino-settings-row">
                <div>
                  <strong>
                    ${tr("Browser notifications", "ब्राउजर सूचना")}
                  </strong>
                  <p>
                    ${
                      subscribed
                        ? tr("Enabled", "चालु छ")
                        : tr("Disabled", "बन्द छ")
                    }
                  </p>
                </div>

                <button
                  type="button"
                  class="saino-settings-primary"
                  data-settings-action="toggle-push"
                  ${busy ? "disabled" : ""}
                >
                  ${
                    subscribed
                      ? tr("Turn off", "बन्द गर्नुहोस्")
                      : tr("Turn on", "चालु गर्नुहोस्")
                  }
                </button>
              </div>

              <p class="saino-settings-hint">
                ${tr("Browser permission:", "ब्राउजर अनुमति:")}
                ${esc(permission)}
              </p>
            `
        }
      </section>

      <section class="saino-settings-section">
        <h3>${tr("In-app notifications", "एपभित्रका सूचनाहरू")}</h3>
        <p class="saino-settings-description">
          ${tr(
            "Saino's notification panel remains available inside the app.",
            "Saino भित्रको सूचना प्यानल एपमा उपलब्ध रहन्छ।"
          )}
        </p>
      </section>
    `;
  }

  function renderChat(node) {
    const enabled = settings.chat.enterToSend === true;

    node.innerHTML = `
      <section class="saino-settings-section">
        <h3>${tr("Chat preferences", "च्याट प्राथमिकता")}</h3>

        <div class="saino-settings-row">
          <div>
            <strong>${tr("Enter to send", "Enter थिचेर पठाउने")}</strong>
            <p>
              ${tr(
                "Press Enter to send. Use Shift + Enter for a new line.",
                "Enter थिच्दा सन्देश पठिन्छ। नयाँ लाइनका लागि Shift + Enter थिच्नुहोस्।"
              )}
            </p>
          </div>

          <label class="saino-settings-switch">
            <input
              type="checkbox"
              data-settings-enter-send
              ${enabled ? "checked" : ""}
            >
            <span aria-hidden="true"></span>
          </label>
        </div>

        <p class="saino-settings-hint">
          ${tr(
            "This preference is saved to your account.",
            "यो प्राथमिकता तपाईंको खातामा सुरक्षित हुन्छ।"
          )}
        </p>
      </section>
    `;
  }

  function renderPrivacy(node) {
    node.innerHTML = `
      <section class="saino-settings-section">
        <h3>${tr("Profile privacy", "प्रोफाइल गोपनीयता")}</h3>

        <p class="saino-settings-description">
          ${tr(
            "Birthday visibility and work or study details are managed in Profile settings.",
            "जन्मदिन र काम वा अध्ययन विवरणको गोपनीयता Profile सेटिङमा व्यवस्थापन हुन्छ।"
          )}
        </p>

        <button
          type="button"
          class="saino-settings-primary"
          data-settings-action="open-profile"
        >
          ${tr("Open Profile", "प्रोफाइल खोल्नुहोस्")}
        </button>
      </section>

      <section class="saino-settings-section">
        <h3>${tr("Privacy controls", "गोपनीयता नियन्त्रण")}</h3>

        <p class="saino-settings-hint">
          ${tr(
            "Online visibility, last seen and read receipt controls are not connected yet.",
            "अनलाइन स्थिति, अन्तिम पटक देखिएको समय र Read Receipt नियन्त्रण अझै जोडिएका छैनन्।"
          )}
        </p>
      </section>
    `;
  }

  async function refreshPushStatus() {
    try {
      if (
        !global.isSecureContext ||
        !global.navigator?.serviceWorker ||
        !global.PushManager
      ) {
        pushStatus = {
          ok: false,
          message: tr(
            "Web Push requires a secure browser connection.",
            "Web Push का लागि सुरक्षित ब्राउजर कनेक्सन आवश्यक छ।"
          )
        };
        render();
        return;
      }

      const registration =
        await global.navigator.serviceWorker.getRegistration();

      if (!registration) {
        pushStatus = {
          ok: false,
          message: tr(
            "Push is not configured yet: this app has no registered Service Worker.",
            "Push सुविधा अझै जडान भएको छैन: यो एपमा Service Worker दर्ता गरिएको छैन।"
          )
        };
        render();
        return;
      }

      pushStatus = await push()?.getStatus?.() || {
        ok: false,
        message: tr(
          "Push notification service is unavailable.",
          "Push सूचना सेवा उपलब्ध छैन।"
        )
      };
    } catch (error) {
      pushStatus = {
        ok: false,
        message: error?.message || tr(
          "Could not check notification status.",
          "सूचनाको अवस्था जाँच गर्न सकिएन।"
        )
      };
    }

    render();
  }

  async function open() {
    const overlay = ensureOverlay();

    overlay.hidden = false;
    document.body.classList.add("saino-settings-open");

    activeTab = "general";
    pushStatus = null;

    renderLoading();

    try {
      await loadSettings();
      render();
    } catch (error) {
      const node = content();

      if (node) {
        node.innerHTML = `
          <div class="saino-settings-error">
            ${esc(error.message || tr(
              "Could not load settings.",
              "सेटिङ लोड गर्न सकिएन।"
            ))}
          </div>
        `;
      }
    }
  }

  function close() {
    const overlay = root();

    if (overlay) overlay.hidden = true;
    document.body.classList.remove("saino-settings-open");
  }

  async function togglePush() {
    if (busy || !pushStatus?.ok) return;

    busy = true;
    render();

    try {
      const subscribed = Boolean(pushStatus.data?.subscribed);

      const result = subscribed
        ? await push()?.disable?.()
        : await push()?.enable?.();

      if (!result?.ok) {
        throw new Error(
          result?.message ||
          tr("Could not update push notifications.", "Push सूचना परिवर्तन भएन।")
        );
      }

      notify(
        subscribed
          ? tr("Push notifications disabled.", "Push सूचना बन्द भयो।")
          : tr("Push notifications enabled.", "Push सूचना चालु भयो।")
      );

      await refreshPushStatus();
    } catch (error) {
      notify(
        error.message || tr("Something went wrong.", "केही समस्या भयो।"),
        "error"
      );
    } finally {
      busy = false;
      render();
    }
  }

  async function handleChange(event) {
    const languageInput = event.target.closest(
      "[data-settings-language]"
    );

    if (languageInput) {
      const value = languageInput.value;

      if (!["ne", "en"].includes(value)) return;

      const previous = settings.general.language;

      global.KSKLanguage?.setLanguage?.(value);

      try {
        await savePatch("general", { language: value });
        notify(tr("Language saved.", "भाषा सुरक्षित भयो।"));
      } catch (error) {
        if (previous) {
          global.KSKLanguage?.setLanguage?.(previous);
        }

        notify(
          error.message || tr("Could not save language.", "भाषा सुरक्षित भएन।"),
          "error"
        );
      }

      render();
      return;
    }

    const enterSend = event.target.closest(
      "[data-settings-enter-send]"
    );

    if (enterSend) {
      try {
        await savePatch("chat", {
          enterToSend: enterSend.checked
        });

        notify(tr("Chat preference saved.", "च्याट प्राथमिकता सुरक्षित भयो।"));
      } catch (error) {
        enterSend.checked = !enterSend.checked;

        notify(
          error.message || tr("Could not save preference.", "प्राथमिकता सुरक्षित भएन।"),
          "error"
        );
      }
    }
  }

  function handleClick(event) {
    const tabButton = event.target.closest("[data-settings-tab]");

    if (tabButton) {
      activeTab = tabButton.dataset.settingsTab;

      if (activeTab === "notifications") {
        pushStatus = null;
        render();
        refreshPushStatus();
      } else {
        render();
      }

      return;
    }

    const actionButton = event.target.closest("[data-settings-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.settingsAction;

    if (action === "close") {
      close();
      return;
    }

    if (action === "toggle-push") {
      togglePush();
      return;
    }

    if (action === "open-profile") {
      close();
      global.SainoProfileUI?.open?.();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && root() && !root().hidden) {
      close();
      return;
    }

    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return;
    }

    const target = event.target;

    if (
      !target?.matches?.("textarea[name='message']") ||
      !target.closest("[data-saino-message-form]") ||
      settings.chat.enterToSend !== true
    ) {
      return;
    }

    event.preventDefault();

    const form = target.closest("form");
    const submitButton = form?.querySelector('button[type="submit"]');

    if (form && !submitButton?.disabled) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        submitButton?.click();
      }
    }
  }

  function handleDocumentClick(event) {
    if (event.target.closest("[data-saino-settings-open]")) {
      event.preventDefault();
      open();
      return;
    }

    const overlay = root();

    if (overlay && event.target === overlay) {
      close();
    }
  }

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);

  global.addEventListener("saino:app-ready", () => {
    injectNavigation();

    const nextUserId = auth()?.getUser?.()?.id || "";

    if (nextUserId !== userId) {
      userId = nextUserId;
      settings = {};
      pushStatus = null;
    }
  });

  global.addEventListener("saino:language-change", () => {
    const navButton = document.querySelector(
      "[data-saino-settings-open]"
    );

    if (navButton) {
      navButton.textContent = tr("Settings", "सेटिङ्स");
      navButton.setAttribute(
        "aria-label",
        tr("Open settings", "सेटिङ्स खोल्नुहोस्")
      );
    }

    const overlay = root();
    if (overlay && !overlay.hidden) render();
  });

  global.SainoSettingsUI = Object.freeze({
    open,
    close,
    getSettings: () => JSON.parse(JSON.stringify(settings))
  });

})(window);
