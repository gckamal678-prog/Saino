/* Saino Story tab shell. Story publishing/viewing backend is not present yet. */
(function (global) {
  "use strict";
  if (global.SainoStoryUI) return;
  const app = () => document.getElementById("saino-app");
  const english = () => global.KSKLanguage?.getLanguage?.() === "en";
  const tr = (en, ne) => english() ? en : ne;

  function open() {
    const host = app();
    const panel = host?.querySelector(".saino-conversation");
    if (!host || !panel) return;
    host.querySelector(".saino-friends-page")?.remove();
    host.querySelector(".saino-sidebar")?.classList.remove("saino-hidden");
    host.classList.remove("feed-open");
    host.classList.add("story-open");
    panel.className = "saino-conversation saino-story-page";
    panel.setAttribute("aria-label", tr("Stories", "स्टोरीहरू"));
    panel.innerHTML = `
      <section class="saino-story-empty">
        <div class="saino-story-symbol" aria-hidden="true">◉</div>
        <h1>${tr("Stories", "स्टोरीहरू")}</h1>
        <p>${tr("Share moments with your friends. Stories are coming soon.", "आफ्ना साथीहरूसँग विशेष पलहरू साझा गर्नुहोस्। स्टोरी सुविधा छिट्टै आउँदैछ।")}</p>
        <span>${tr("Story service is not connected yet.", "स्टोरी सेवा अहिले जोडिएको छैन।")}</span>
      </section>`;
    global.SainoNavigation?.setActive?.("story");
  }

  function close() {
    const host = app();
    host?.classList.remove("story-open");
  }

  global.SainoStoryUI = Object.freeze({ open, close });
})(window);
