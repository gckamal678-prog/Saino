
/* Saino application bootstrap and authentication screen. */
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

  const root = () => document.getElementById(ROOT_ID);
  const language = () => global.KSKLanguage;

  const t = (key, fallbackEn, fallbackNe) => {
    const service = language();
    if (service?.t) return service.t(key);
    return service?.getLanguage?.() === "en"
      ? fallbackEn
      : fallbackNe;
  };

  const isEnglish = () =>
    language()?.getLanguage?.() === "en";

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

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
        : (
            mode === "signup"
              ? t("signUp", "Create account", "खाता बनाउनुहोस्")
              : t("login", "Log in", "लगइन")
          );
    }
  }

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

    if (busy) {
      setBusy(true);
    } else if (statusMessage) {
      setStatus(statusMessage, statusType);
    }
  }

  function renderAuthenticated(user) {
    const host = root();
    if (!host) return;

    const english = isEnglish();
    const email = escapeHTML(user?.email || "");

    host.className = "saino-app";

    host.innerHTML = `
      <aside class="saino-sidebar">

        <header class="saino-sidebar-header">

          <div class="saino-brand">
            <span class="saino-brand-mark">S</span>
            <span>Saino</span>
          </div>

          <div class="saino-header-actions">

            <button
              class="saino-icon-button"
              type="button"
              data-action="toggle-language"
              aria-label="Change language"
            >
              ${english ? "ने" : "EN"}
            </button>

            <button
              class="saino-icon-button"
              type="button"
              data-action="logout"
              aria-label="Log out"
            >
              ↪
            </button>

          </div>
        </header>

        <div class="saino-search">
          <input
            type="search"
            disabled
            placeholder="${english ? "Search chats" : "च्याट खोज्नुहोस्"}"
          >
        </div>

        <nav class="saino-tabs" aria-label="Main navigation">

          <button class="saino-tab active" type="button">
            ${english ? "Chats" : "च्याट"}
          </button>

          <button class="saino-tab" type="button" disabled>
            ${english ? "Updates" : "अपडेट"}
          </button>

          <button class="saino-tab" type="button" disabled>
            ${english ? "Friends" : "साथीहरू"}
          </button>

        </nav>

        <div class="saino-chat-list">

          <div class="saino-empty-state">
            <div class="saino-empty-icon">S</div>

            <h2>
              ${
                english
                  ? "Your chats will appear here"
                  : "तपाईंका च्याट यहाँ देखिनेछन्"
              }
            </h2>

            <p>
              ${
                english
                  ? "Chat list is the next module being connected."
                  : "च्याट सूची अर्को चरणमा जोडिँदैछ।"
              }
            </p>
          </div>

        </div>
      </aside>

      <section
        class="saino-conversation"
        style="display:flex;align-items:center;justify-content:center;padding:24px;text-align:center"
      >

        <div class="saino-empty-state">

          <div class="saino-empty-icon">S</div>

          <h2>
            ${english ? "Welcome to Saino" : "Saino मा स्वागत छ"}
          </h2>

          <p>
            ${english ? "You are signed in as" : "तपाईं लगइन हुनुहुन्छ"}
            <br>
            <strong>${email}</strong>
          </p>

        </div>
      </section>
    `;
  }

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

    const auth = global.KSKSupabaseAuth;

    if (!auth) {
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
      isEnglish() ? "Please wait…" : "कृपया पर्खनुहोस्…"
    );

    try {
      if (mode === "signup") {
        const result = await auth.signUp(email, password);

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
        await auth.signIn(email, password);
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

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const action = button.dataset.action;

    if (action === "toggle-language") {
      language()?.toggleLanguage?.();

      const user = global.KSKSupabaseAuth?.getUser?.();

      if (user) {
        renderAuthenticated(user);
      } else {
        renderAuth();
      }

      return;
    }

    if (action === "toggle-auth") {
      mode = mode === "login" ? "signup" : "login";

      statusMessage = "";
      renderAuth();

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
        await global.KSKSupabaseAuth.resetPassword(email);

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
        await global.KSKSupabaseAuth.signOut();

      } catch (error) {
        console.error("Saino logout failed:", error);
        button.disabled = false;
      }
    }
  }

  async function boot() {
    if (initialized) return;

    initialized = true;

    const host = root();
    if (!host) return;

    host.setAttribute("aria-busy", "true");

    try {
      const auth = global.KSKSupabaseAuth;

      if (!auth) {
        throw new Error("Authentication module did not load.");
      }

      const ready = await auth.initialize();
      const user = auth.getUser();

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

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);

  global.addEventListener("ksk:auth-change", event => {
    const user =
      event.detail?.user ||
      global.KSKSupabaseAuth?.getUser?.();

    if (user) {
      renderAuthenticated(user);
    } else if (initialized) {
      renderAuth();
    }
  });

  global.addEventListener("ksk:auth-ready", event => {
    lastAuthError = event.detail?.error || "";

    if (!initialized) return;

    const user =
      event.detail?.user ||
      global.KSKSupabaseAuth?.getUser?.();

    if (user) {
      renderAuthenticated(user);
    } else if (event.detail?.error) {
      renderAuth(event.detail.error);
    }
  });

  global.addEventListener("saino:language-change", () => {
    const user = global.KSKSupabaseAuth?.getUser?.();

    if (user) {
      renderAuthenticated(user);
    } else if (initialized) {
      renderAuth();
    }
  });

  function start() {
    if (
      language()?.subscribe &&
      !languageUnsubscribe
    ) {
      languageUnsubscribe = language().subscribe(() => {
        const user = global.KSKSupabaseAuth?.getUser?.();

        if (user) {
          renderAuthenticated(user);
        } else if (initialized) {
          renderAuth();
        }
      });
    }

    boot();
  }

  global.SainoApp = Object.freeze({
    initialize: start,

    render: () => {
      const user = global.KSKSupabaseAuth?.getUser?.();

      if (user) {
        renderAuthenticated(user);
      } else {
        renderAuth();
      }
    }
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
