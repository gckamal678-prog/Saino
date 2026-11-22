
/* Saino Application Shell */
(function (global) {
  "use strict";

  if (global.SainoApp) return;

  const ROOT_ID = "saino-app";

  let mode = "login";
  let initialized = false;
  let busy = false;
  let statusMessage = "";
  let statusType = "info";
  let lastAuthError = "";
  let languageUnsubscribe = null;
  let activeConversation = null;

  const root = () => document.getElementById(ROOT_ID);
  const language = () => global.KSKLanguage;
  const auth = () => global.KSKSupabaseAuth;

  const isEnglish = () =>
    language()?.getLanguage?.() === "en";

  const t = (key, en, ne) => {
    const service = language();
    if (service?.t) return service.t(key);
    return isEnglish() ? en : ne;
  };

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  /* TOAST */

  function ensureToastHost() {
    let host = document.querySelector(
      ".saino-toast-container"
    );

    if (host) return host;

    host = document.createElement("div");
    host.className = "saino-toast-container";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");

    document.body.appendChild(host);

    return host;
  }

  function showToast(message, type = "success") {
    const text = String(message || "").trim();
    if (!text) return;

    const host = ensureToastHost();
    const toast = document.createElement("div");

    toast.className =
      `saino-toast ${type === "error" ? "error" : "success"}`;

    toast.textContent = text;
    host.appendChild(toast);

    global.setTimeout(() => {
      toast.remove();

      if (!host.childElementCount) {
        host.remove();
      }
    }, 3200);
  }

  /* AUTH STATUS */

  function setStatus(message, type = "info") {
    statusMessage = String(message || "");
    statusType = type;

    const node = root()?.querySelector(
      "[data-saino-auth-status]"
    );

    if (!node) return;

    node.textContent = statusMessage;
    node.dataset.type = statusType;
    node.hidden = !statusMessage;
  }

  function setBusy(value) {
    busy = Boolean(value);

    const form = root()?.querySelector(
      "[data-saino-auth-form]"
    );

    if (!form) return;

    form.querySelectorAll("button,input").forEach(el => {
      el.disabled = busy;
    });

    const submit = form.querySelector('[type="submit"]');

    if (submit) {
      submit.textContent = busy
        ? t("loading", "Loading…", "लोड हुँदैछ…")
        : mode === "signup"
          ? t("signUp", "Create account", "खाता बनाउनुहोस्")
          : t("login", "Log in", "लगइन");
    }
  }

  /* AUTH SCREEN */

  function renderAuth(errorMessage = "") {
    const host = root();
    if (!host) return;

    const english = isEnglish();

    const title = mode === "signup"
      ? (
          english
            ? "Create your Saino account"
            : "आफ्नो Saino खाता बनाउनुहोस्"
        )
      : (
          english
            ? "Welcome back"
            : "फेरि स्वागत छ"
        );

    const intro = english
      ? "Connect with friends through simple, private conversations."
      : "सजिलो र सुरक्षित कुराकानीमार्फत साथीहरूसँग जोडिनुहोस्।";

    host.className = "saino-app";

    host.innerHTML = `
      <section class="saino-auth-page">

        <div class="saino-auth-card">

          <div class="saino-brand" style="margin-bottom:22px">
            <span class="saino-brand-mark" aria-hidden="true">S</span>
            <span>Saino</span>
          </div>

          <h1>${escapeHTML(title)}</h1>
          <p>${escapeHTML(intro)}</p>

          <form data-saino-auth-form novalidate>

            <div class="saino-form-group">
              <label for="saino-email">
                ${english ? "Email address" : "इमेल ठेगाना"}
              </label>

              <input
                id="saino-email"
                name="email"
                type="email"
                autocomplete="email"
                maxlength="254"
                required
              >
            </div>

            <div class="saino-form-group">
              <label for="saino-password">
                ${english ? "Password" : "पासवर्ड"}
              </label>

              <input
                id="saino-password"
                name="password"
                type="password"
                autocomplete="${mode === "signup" ? "new-password" : "current-password"}"
                minlength="6"
                maxlength="128"
                required
              >
            </div>

            <button class="saino-button" type="submit">
              ${
                mode === "signup"
                  ? (english ? "Create account" : "खाता बनाउनुहोस्")
                  : (english ? "Log in" : "लगइन")
              }
            </button>

          </form>

          <p
            class="saino-auth-status"
            data-saino-auth-status
            role="status"
            aria-live="polite"
            data-type="${escapeHTML(statusType)}"
            ${statusMessage || errorMessage ? "" : "hidden"}
          >${escapeHTML(errorMessage || statusMessage)}</p>

          <button
            class="saino-auth-link"
            type="button"
            data-action="toggle-auth"
            style="margin-top:14px;background:none;border:0;color:var(--saino-primary);padding:8px 0"
          >
            ${
              mode === "signup"
                ? (
                    english
                      ? "Already have an account? Log in"
                      : "पहिल्यै खाता छ? लगइन गर्नुहोस्"
                  )
                : (
                    english
                      ? "New to Saino? Create an account"
                      : "नयाँ प्रयोगकर्ता? खाता बनाउनुहोस्"
                  )
            }
          </button>

          ${
            mode === "login"
              ? `
                <button
                  type="button"
                  data-action="forgot-password"
                  style="display:block;background:none;border:0;color:var(--saino-text-muted);padding:7px 0"
                >
                  ${english ? "Forgot password?" : "पासवर्ड बिर्सनुभयो?"}
                </button>
              `
              : ""
          }

          <div style="display:flex;justify-content:flex-end;margin-top:12px">
            <button
              type="button"
              data-action="toggle-language"
              class="saino-button-secondary"
              style="min-height:36px;padding:0 13px;border-radius:18px"
            >
              ${english ? "नेपाली" : "English"}
            </button>
          </div>

        </div>
      </section>
    `;

    if (busy) setBusy(true);
  }

  /* WELCOME PANEL */

  function renderWelcomePanel() {
    return `
      <section
        class="saino-conversation saino-welcome-panel"
        aria-label="${isEnglish() ? "Welcome" : "स्वागत"}"
      >
        <div class="saino-empty-state">

          <div class="saino-empty-icon" aria-hidden="true">S</div>

          <h2>
            ${escapeHTML(t(
              "welcomeTitle",
              "Welcome to Saino",
              "Saino मा स्वागत छ"
            ))}
          </h2>

          <p>
            ${escapeHTML(t(
              "welcomeBody",
              "Start a simple and secure conversation with your friends.",
              "आफ्ना साथीहरूसँग सुरक्षित र सजिलो तरिकाले कुराकानी सुरु गर्नुहोस्।"
            ))}
          </p>

        </div>
      </section>
    `;
  }

  /* IMAGE VALIDATION */

  function safeImageURL(value) {
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

  /* CONVERSATION PANEL */

  function renderConversationPanel(conversation) {
    const name = conversation?.name ||
      t("conversation", "Conversation", "कुराकानी");

    const avatar =
      conversation?.avatar ||
      conversation?.avatarUrl ||
      "";

    const initial =
      Array.from(String(name).trim())[0] || "S";

    const safeAvatar = safeImageURL(avatar);

    const avatarMarkup = safeAvatar
      ? `<img
           src="${escapeHTML(safeAvatar)}"
           alt=""
           referrerpolicy="no-referrer"
         >`
      : escapeHTML(initial);

    return `
      <section
        class="saino-conversation"
        aria-label="${escapeHTML(name)}"
      >

        <header class="saino-conversation-header">

          <div class="saino-contact">

            <button
              class="saino-icon-button saino-back-button"
              type="button"
              data-action="back-to-chats"
              aria-label="${escapeHTML(t("back", "Back", "पछाडि"))}"
            >‹</button>

            <div class="saino-avatar">
              ${avatarMarkup}
            </div>

            <div class="saino-contact-info">

              <div class="saino-contact-name">
                ${escapeHTML(name)}
              </div>

              <div class="saino-contact-status">
                ${escapeHTML(t(
                  "messages",
                  "Messages",
                  "सन्देशहरू"
                ))}
              </div>

            </div>
          </div>

          <div
            class="saino-conversation-actions"
            aria-label="${isEnglish() ? "Conversation options" : "कुराकानी विकल्प"}"
          ></div>

        </header>

        <div
          class="saino-messages"
          data-saino-messages="${escapeHTML(conversation?.id || "")}"
          aria-live="polite"
        ></div>

        <div
          class="saino-conversation-mount"
          data-saino-conversation-mount
        ></div>

      </section>
    `;
  }

  /* MAIN APPLICATION */

  function renderAuthenticated(user) {
    const host = root();
    if (!host) return;

    const english = isEnglish();
    const email = escapeHTML(user?.email || "");

    const activeView = activeConversation
      ? renderConversationPanel(activeConversation)
      : renderWelcomePanel();

    host.className =
      `saino-app${activeConversation ? " chat-open" : ""}`;

    host.innerHTML = `

      <aside class="saino-sidebar">

        <header class="saino-sidebar-header">

          <div class="saino-brand">
            <span class="saino-brand-mark" aria-hidden="true">S</span>
            <span>Saino</span>
          </div>

          <div class="saino-header-actions">

            <button
              class="saino-icon-button"
              type="button"
              data-action="toggle-language"
              aria-label="${english ? "Change language" : "भाषा परिवर्तन"}"
              title="${english ? "Change language" : "भाषा परिवर्तन"}"
            >
              ${english ? "ने" : "EN"}
            </button>

            <button
              class="saino-icon-button"
              type="button"
              data-action="logout"
              aria-label="${escapeHTML(t("logout", "Log out", "लगआउट"))}"
              title="${escapeHTML(t("logout", "Log out", "लगआउट"))}"
            >
              ↪
            </button>

          </div>
        </header>

        <div class="saino-search">

          <span class="saino-search-icon" aria-hidden="true">⌕</span>

          <input
            type="search"
            placeholder="${escapeHTML(t("search", "Search", "खोज्नुहोस्"))}"
            aria-label="${escapeHTML(t("search", "Search chats", "च्याट खोज्नुहोस्"))}"
            autocomplete="off"
          >

        </div>

        <nav
          class="saino-tabs"
          aria-label="${english ? "Main navigation" : "मुख्य नेभिगेसन"}"
        >
          <button
            class="saino-tab active"
            type="button"
            aria-current="page"
          >
            ${escapeHTML(t("chats", "Chats", "च्याट"))}
          </button>
        </nav>

        <div
          class="saino-chat-list"
          aria-label="${escapeHTML(t("chats", "Chats", "च्याट"))}"
        ></div>

        <footer
          class="saino-sidebar-footer"
          title="${email}"
        >
          <span class="saino-user-dot" aria-hidden="true"></span>
          <span class="saino-user-email">${email}</span>
        </footer>

      </aside>

      ${activeView}
    `;

    global.dispatchEvent(new CustomEvent("saino:app-ready", {
      detail: {
        user,
        conversation: activeConversation
      }
    }));
  }

  /* AUTH FORM SUBMIT */

  async function handleSubmit(event) {
    const form = event.target.closest(
      "[data-saino-auth-form]"
    );

    if (!form) return;

    event.preventDefault();

    if (busy) return;

    const data = new FormData(form);

    const email = String(
      data.get("email") || ""
    ).trim().toLowerCase();

    const password = String(
      data.get("password") || ""
    );

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 6
    ) {
      setStatus(
        isEnglish()
          ? "Enter a valid email and password (at least 6 characters)."
          : "सही इमेल र कम्तीमा ६ अक्षरको पासवर्ड राख्नुहोस्।",
        "error"
      );

      return;
    }

    const service = auth();

    if (!service) {
      setStatus(
        isEnglish()
          ? "Authentication service is unavailable."
          : "लगइन सेवा उपलब्ध छैन।",
        "error"
      );

      return;
    }

    setBusy(true);

    setStatus(
      t("loading", "Please wait…", "कृपया पर्खनुहोस्…")
    );

    try {
      if (mode === "signup") {
        const result = await service.signUp(email, password);

        if (result?.confirmationRequired) {
          mode = "login";

          statusMessage = isEnglish()
            ? "Account created. Check your email for the confirmation link."
            : "खाता अनुरोध सफल भयो। इमेलमा आएको पुष्टि Link खोल्नुहोस्।";

          statusType = "success";

          renderAuth();
          return;
        }
      } else {
        await service.signIn(email, password);
      }

    } catch (error) {
      setStatus(
        error?.message ||
          (
            isEnglish()
              ? "Could not complete the request."
              : "अनुरोध पूरा हुन सकेन।"
          ),
        "error"
      );

    } finally {
      setBusy(false);
    }
  }

  /* BUTTON ACTIONS */

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const action = button.dataset.action;

    if (action === "toggle-language") {
      language()?.toggleLanguage?.();

      const user = auth()?.getUser?.();

      if (user) renderAuthenticated(user);
      else renderAuth();

      return;
    }

    if (action === "toggle-auth") {
      mode = mode === "login" ? "signup" : "login";

      statusMessage = "";
      statusType = "info";

      renderAuth();

      return;
    }

    if (action === "back-to-chats") {
      activeConversation = null;

      const user = auth()?.getUser?.();

      if (user) renderAuthenticated(user);

      return;
    }

    if (action === "forgot-password") {
      const email = String(
        root()?.querySelector('[name="email"]')?.value || ""
      ).trim().toLowerCase();

      if (!email) {
        setStatus(
          isEnglish()
            ? "Enter your email address first."
            : "पहिले इमेल ठेगाना लेख्नुहोस्।",
          "error"
        );

        root()?.querySelector('[name="email"]')?.focus();

        return;
      }

      button.disabled = true;

      try {
        await auth().resetPassword(email);

        setStatus(
          isEnglish()
            ? "Password reset link sent."
            : "पासवर्ड परिवर्तन Link इमेलमा पठाइयो।",
          "success"
        );

      } catch (error) {
        setStatus(
          error?.message ||
            (
              isEnglish()
                ? "Could not send reset link."
                : "Reset Link पठाउन सकिएन।"
            ),
          "error"
        );

      } finally {
        button.disabled = false;
      }

      return;
    }

    if (action === "logout") {
      button.disabled = true;

      try {
        await auth().signOut();
        activeConversation = null;

      } catch (error) {
        showToast(
          error?.message ||
            (
              isEnglish()
                ? "Could not log out."
                : "लगआउट हुन सकेन।"
            ),
          "error"
        );

        button.disabled = false;
      }
    }
  }

  /* APPLICATION BOOT */

  async function boot() {
    if (initialized) return;

    initialized = true;

    const host = root();
    if (!host) return;

    host.setAttribute("aria-busy", "true");

    try {
      const service = auth();

      if (!service) {
        throw new Error(
          "Authentication module did not load."
        );
      }

      const ready = await service.initialize();
      const user = service.getUser();

      if (user) {
        renderAuthenticated(user);

      } else if (ready === false) {
        renderAuth(
          lastAuthError ||
            (
              isEnglish()
                ? "Could not connect to the server. Check your internet and reload."
                : "सर्भरमा जडान हुन सकेन। इन्टरनेट जाँचेर Reload गर्नुहोस्।"
            )
        );

      } else {
        renderAuth();
      }

    } catch (error) {
      console.error("Saino initialization failed:", error);

      renderAuth(
        error?.message ||
          (
            isEnglish()
              ? "Could not connect. Reload and try again."
              : "जडान हुन सकेन। Reload गरेर फेरि प्रयास गर्नुहोस्।"
          )
      );

    } finally {
      host.removeAttribute("aria-busy");
    }
  }

  /* GLOBAL EVENTS */

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);

  global.addEventListener(
    "saino:conversation-select",
    event => {
      const conversation = event.detail?.conversation;

      if (!conversation) return;

      activeConversation = conversation;

      const user = auth()?.getUser?.();

      if (user) renderAuthenticated(user);
    }
  );

  global.addEventListener(
    "saino:chat-list-updated",
    event => {
      if (!activeConversation) return;

      const updated = (
        event.detail?.conversations || []
      ).find(item => item.id === activeConversation.id);

      if (updated) activeConversation = updated;
    }
  );

  global.addEventListener("ksk:auth-change", event => {
    const user =
      event.detail?.user ||
      auth()?.getUser?.();

    if (user) {
      renderAuthenticated(user);

    } else if (initialized) {
      activeConversation = null;
      renderAuth();
    }
  });

  global.addEventListener("ksk:auth-ready", event => {
    lastAuthError = event.detail?.error || "";

    if (!initialized) return;

    const user =
      event.detail?.user ||
      auth()?.getUser?.();

    if (user) {
      renderAuthenticated(user);

    } else if (event.detail?.error) {
      renderAuth(event.detail.error);
    }
  });

  global.addEventListener("saino:language-change", () => {
    const user = auth()?.getUser?.();

    if (user) renderAuthenticated(user);
    else if (initialized) renderAuth();
  });

  /* START */

  function start() {
    if (
      language()?.subscribe &&
      !languageUnsubscribe
    ) {
      languageUnsubscribe = language().subscribe(() => {
        const user = auth()?.getUser?.();

        if (user) renderAuthenticated(user);
        else if (initialized) renderAuth();
      });
    }

    boot();
  }

  /* PUBLIC API */

  global.SainoApp = Object.freeze({
    initialize: start,

    render: () => {
      const user = auth()?.getUser?.();

      if (user) renderAuthenticated(user);
      else renderAuth();
    },

    getActiveConversation: () => activeConversation
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

})(window);
