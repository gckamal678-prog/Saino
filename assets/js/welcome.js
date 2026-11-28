
/* SAINO — Splash and Welcome Screen */

(function () {
  "use strict";

  if (window.SainoWelcome || !document.body) return;

  const SPLASH_DURATION = 1500;

  let overlay = null;
  let dismissed = false;
  let splashTimer = null;

  function splashMarkup() {
    return `
      <div class="saino-welcome-content"
           role="status" aria-live="polite">

        <div class="saino-welcome-flag">🇳🇵</div>

        <div class="saino-welcome-logo">S</div>

        <h1 class="saino-welcome-name">Saino</h1>

        <div class="saino-welcome-underline"></div>

        <p class="saino-welcome-slogan">
          नेपाली मन, नेपाली संग
        </p>

        <div class="saino-splash-loading">
          <span class="saino-splash-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span>साइनो खुल्दैछ…</span>
        </div>

      </div>
    `;
  }

  function welcomeMarkup() {
    return `
      <section class="saino-welcome-content"
               aria-labelledby="saino-welcome-title">

        <div class="saino-welcome-flag">🇳🇵</div>

        <div class="saino-welcome-logo">S</div>

        <h1 class="saino-welcome-name"
            id="saino-welcome-title">
          Saino
        </h1>

        <div class="saino-welcome-underline"></div>

        <p class="saino-welcome-slogan">
          नेपाली मन, नेपाली संग
        </p>

        <p class="saino-welcome-description">
          टाढा भएका आफ्ना मान्छेसँग नजिक बनौँ।
          बोलौँ, जोडिऔँ र नयाँ साइनो बनाऔँ।
        </p>

        <div class="saino-welcome-actions">

          <button class="saino-welcome-start"
                  type="button"
                  data-saino-welcome-enter>
            साइनो सुरु गरौँ →
          </button>

          <button class="saino-welcome-skip"
                  type="button"
                  data-saino-welcome-enter>
            लगइन / खाता खोल्नुहोस्
          </button>

        </div>

        <p class="saino-welcome-bottom-note">
          आफ्नोपन जोड्ने डिजिटल चौतारी 🇳🇵
        </p>

      </section>
    `;
  }

  function dismiss() {
    if (dismissed || !overlay) return;

    dismissed = true;

    if (splashTimer) {
      window.clearTimeout(splashTimer);
    }

    overlay.classList.add("is-leaving");

    window.setTimeout(() => {
      overlay?.remove();
      overlay = null;
    }, 480);
  }

  function showWelcome() {
    if (dismissed || !overlay) return;

    overlay.innerHTML = welcomeMarkup();
    overlay.setAttribute(
      "aria-label",
      "Saino मा स्वागत छ"
    );
  }

  function mount() {
    overlay = document.createElement("div");

    overlay.className = "saino-welcome-overlay";

    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute(
      "aria-label",
      "Saino splash screen"
    );

    overlay.innerHTML = splashMarkup();

    document.body.appendChild(overlay);

    overlay.addEventListener("click", event => {
      if (
        event.target.closest(
          "[data-saino-welcome-enter]"
        )
      ) {
        dismiss();
      }
    });

    splashTimer = window.setTimeout(
      showWelcome,
      SPLASH_DURATION
    );
  }

  window.SainoWelcome = Object.freeze({
    dismiss
  });

  mount();

})();
