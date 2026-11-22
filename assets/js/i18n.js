
/* Saino — bilingual language service (English / नेपाली) */
(function (global) {
  "use strict";

  if (global.KSKLanguage) return;

  const STORAGE_KEY = "saino.language";

  const DICTIONARY = Object.freeze({
    ne: Object.freeze({
      appName: "Saino",
      search: "खोज्नुहोस्",
      chats: "च्याट",
      updates: "अपडेट",
      friends: "साथीहरू",
      messages: "सन्देशहरू",
      conversation: "कुराकानी",
      newChat: "नयाँ च्याट",
      newGroup: "नयाँ समूह",
      messagePlaceholder: "सन्देश लेख्नुहोस्",
      send: "पठाउनुहोस्",
      attachFile: "फाइल जोड्नुहोस्",
      online: "अनलाइन",
      offline: "अफलाइन",
      lastSeen: "अन्तिम पटक {{time}} मा देखिएको",
      today: "आज",
      yesterday: "हिजो",
      loading: "लोड हुँदैछ…",
      welcomeTitle: "Saino मा स्वागत छ",
      welcomeBody: "आफ्ना साथीहरूसँग सुरक्षित र सजिलो तरिकाले कुराकानी सुरु गर्नुहोस्।",
      noChats: "अहिलेसम्म कुनै च्याट छैन।",
      noMessages: "अहिलेसम्म कुनै सन्देश छैन।",
      messageDeleted: "सन्देश हटाइयो",
      edited: "सम्पादन गरिएको",
      startConversation: "कुराकानी सुरु गर्नुहोस्",
      notifications: "सूचनाहरू",
      profile: "प्रोफाइल",
      settings: "सेटिङ्स",
      language: "भाषा",
      english: "English",
      nepali: "नेपाली",
      login: "लगइन",
      signUp: "खाता बनाउनुहोस्",
      logout: "लगआउट",
      email: "इमेल",
      password: "पासवर्ड",
      confirmPassword: "पासवर्ड पुष्टि गर्नुहोस्",
      forgotPassword: "पासवर्ड बिर्सनुभयो?",
      cancel: "रद्द गर्नुहोस्",
      close: "बन्द गर्नुहोस्",
      back: "पछाडि",
      save: "सेभ गर्नुहोस्",
      saved: "सेभ भयो",
      edit: "सम्पादन",
      delete: "मेटाउनुहोस्",
      retry: "फेरि प्रयास गर्नुहोस्",
      genericError: "केही समस्या भयो। फेरि प्रयास गर्नुहोस्।",
      messageSent: "सन्देश पठाइयो।",
      messageFailed: "सन्देश पठाउन सकिएन।",
      searchUsers: "मानिस खोज्नुहोस्",
      noResults: "कुनै नतिजा भेटिएन।",
      unread: "नपढिएको",
      typing: "लेख्दै…",
      yesterdayAt: "हिजो {{time}}",
      justNow: "भर्खरै"
    }),

    en: Object.freeze({
      appName: "Saino",
      search: "Search",
      chats: "Chats",
      updates: "Updates",
      friends: "Friends",
      messages: "Messages",
      conversation: "Conversation",
      newChat: "New chat",
      newGroup: "New group",
      messagePlaceholder: "Type a message",
      send: "Send",
      attachFile: "Attach file",
      online: "Online",
      offline: "Offline",
      lastSeen: "Last seen {{time}}",
      today: "Today",
      yesterday: "Yesterday",
      loading: "Loading…",
      welcomeTitle: "Welcome to Saino",
      welcomeBody: "Start a simple and secure conversation with your friends.",
      noChats: "No chats yet.",
      noMessages: "No messages yet.",
      messageDeleted: "Message deleted",
      edited: "edited",
      startConversation: "Start a conversation",
      notifications: "Notifications",
      profile: "Profile",
      settings: "Settings",
      language: "Language",
      english: "English",
      nepali: "नेपाली",
      login: "Log in",
      signUp: "Create account",
      logout: "Log out",
      email: "Email",
      password: "Password",
      confirmPassword: "Confirm password",
      forgotPassword: "Forgot password?",
      cancel: "Cancel",
      close: "Close",
      back: "Back",
      save: "Save",
      saved: "Saved",
      edit: "Edit",
      delete: "Delete",
      retry: "Try again",
      genericError: "Something went wrong. Please try again.",
      messageSent: "Message sent.",
      messageFailed: "Message could not be sent.",
      searchUsers: "Find people",
      noResults: "No results found.",
      unread: "Unread",
      typing: "Typing…",
      yesterdayAt: "Yesterday at {{time}}",
      justNow: "Just now"
    })
  });

  function normalizeLanguage(value) {
    return value === "en" ? "en" :
      value === "ne" ? "ne" : null;
  }

  function readSavedLanguage() {
    try {
      return normalizeLanguage(
        global.localStorage.getItem(STORAGE_KEY)
      );
    } catch (_) {
      return null;
    }
  }

  function detectLanguage() {
    const browserLanguage =
      String(global.navigator?.language || "").toLowerCase();

    return browserLanguage.startsWith("en") ? "en" : "ne";
  }

  let currentLanguage =
    readSavedLanguage() || detectLanguage();

  const subscribers = new Set();

  function t(key, values = {}) {
    const dictionary = DICTIONARY[currentLanguage];
    const fallback = DICTIONARY.en;

    const template =
      dictionary[key] ?? fallback[key] ?? key;

    return String(template).replace(
      /\{\{\s*([\w]+)\s*\}\}/g,
      (_, name) => {
        return values[name] == null
          ? ""
          : String(values[name]);
      }
    );
  }

  function applyTranslations(root) {
    const doc = global.document;
    if (!doc) return;

    const scope =
      root && typeof root.querySelectorAll === "function"
        ? root
        : doc;

    const selectors = [
      "[data-i18n]",
      "[data-i18n-placeholder]",
      "[data-i18n-title]",
      "[data-i18n-aria-label]",
      "[data-i18n-value]"
    ].join(",");

    const elements = [];

    if (scope.matches?.(selectors)) {
      elements.push(scope);
    }

    elements.push(...scope.querySelectorAll(selectors));

    for (const element of elements) {
      const textKey =
        element.getAttribute("data-i18n");

      const placeholderKey =
        element.getAttribute("data-i18n-placeholder");

      const titleKey =
        element.getAttribute("data-i18n-title");

      const ariaKey =
        element.getAttribute("data-i18n-aria-label");

      const valueKey =
        element.getAttribute("data-i18n-value");

      if (textKey) {
        element.textContent = t(textKey);
      }

      if (placeholderKey) {
        element.setAttribute(
          "placeholder",
          t(placeholderKey)
        );
      }

      if (titleKey) {
        element.setAttribute("title", t(titleKey));
      }

      if (ariaKey) {
        element.setAttribute("aria-label", t(ariaKey));
      }

      if (valueKey && "value" in element) {
        element.value = t(valueKey);
      }
    }

    doc.documentElement?.setAttribute(
      "lang",
      currentLanguage
    );
  }

  function setLanguage(value) {
    const nextLanguage = normalizeLanguage(value);

    if (!nextLanguage) return false;

    const previousLanguage = currentLanguage;

    if (nextLanguage === previousLanguage) {
      applyTranslations();
      return true;
    }

    currentLanguage = nextLanguage;

    try {
      global.localStorage.setItem(
        STORAGE_KEY,
        currentLanguage
      );
    } catch (_) {
      // Language still works without browser storage.
    }

    applyTranslations();

    const detail = {
      language: currentLanguage,
      previousLanguage
    };

    if (typeof global.CustomEvent === "function") {
      global.dispatchEvent(
        new global.CustomEvent(
          "saino:language-change",
          { detail }
        )
      );

      global.dispatchEvent(
        new global.CustomEvent(
          "ksk:language-change",
          { detail }
        )
      );
    }

    subscribers.forEach(listener => {
      try {
        listener(currentLanguage, previousLanguage);
      } catch (error) {
        console.error(
          "Saino language listener failed:",
          error
        );
      }
    });

    return true;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    subscribers.add(listener);

    return () => subscribers.delete(listener);
  }

  function formatDate(value, options = {}) {
    const date =
      value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const locale =
      currentLanguage === "en" ? "en-IN" : "ne-NP";

    return new Intl.DateTimeFormat(
      locale,
      options
    ).format(date);
  }

  function formatTime(
    value,
    options = {
      hour: "numeric",
      minute: "2-digit"
    }
  ) {
    return formatDate(value, options);
  }

  function formatNumber(value, options = {}) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "";

    const locale =
      currentLanguage === "en" ? "en-IN" : "ne-NP";

    return new Intl.NumberFormat(
      locale,
      options
    ).format(number);
  }

  global.KSKLanguage = Object.freeze({
    getLanguage: () => currentLanguage,
    setLanguage,

    toggleLanguage: () =>
      setLanguage(
        currentLanguage === "ne" ? "en" : "ne"
      ),

    t,
    applyTranslations,
    subscribe,
    formatDate,
    formatTime,
    formatNumber,

    getSupportedLanguages: () => ["ne", "en"]
  });

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener(
        "DOMContentLoaded",
        () => applyTranslations(),
        { once: true }
      );
    } else {
      applyTranslations();
    }
  }
})(window);
