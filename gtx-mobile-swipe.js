/* =========================================================
   GOTRADEX MOBILE PAGE NAVIGATION
   TAP-ONLY NEXT PAGE CONTROL
   ========================================================= */

(function () {
  "use strict";

  /*
   The chart must keep all touch gestures for zooming/panning.
   Navigation is therefore TAP-ONLY on the yellow next-page button.
  */

  const sequence = [
    { page: "dashboard", title: "Dashboard" },
    { page: "signals", title: "Signal Analyzer" },
    { page: "markets", title: "Markets & Assets" },
    { page: "robot", title: "Trading Robot" }
  ];

  function currentIndex() {
    const active = document.querySelector(".app-page.active-page");
    const name =
      window.GloDateXSwipePage ||
      window.GTXSwipePage ||
      active?.id?.replace(/^page-/, "") ||
      "";

    return sequence.findIndex(item => item.page === name);
  }

  function getActivePage() {
    return document.querySelector(".app-page.active-page");
  }

  function nextItem(index) {
    return sequence[(index + 1) % sequence.length];
  }

  function previousItem(index) {
    return sequence[(index - 1 + sequence.length) % sequence.length];
  }

  function updateHint() {
    const active = getActivePage();
    if (!active || window.innerWidth > 850) return;

    let hint = active.querySelector(".gtx-swipe-next-hint");

    if (!hint) {
      hint = document.createElement("button");
      hint.className = "gtx-swipe-next-hint";
      hint.type = "button";
      hint.setAttribute("aria-label", "Open next page");

      hint.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const index = currentIndex();
        if (index >= 0) {
          goTo((index + 1) % sequence.length);
        }
      });

      active.appendChild(hint);
    }

    const index = currentIndex();
    if (index < 0) return;

    const next = nextItem(index);

    hint.innerHTML =
      "<span>Next: " +
      next.title +
      "</span><b aria-hidden=\"true\">›</b>";
  }

  function goTo(index) {
    const item = sequence[index];
    if (!item || typeof window.showPage !== "function") return;

    window.showPage(item.page);

    requestAnimationFrame(() => {
      const active = getActivePage();

      if (active) {
        active.classList.remove("gtx-swipe-enter");
        void active.offsetWidth;
        active.classList.add("gtx-swipe-enter");

        setTimeout(() => {
          active.classList.remove("gtx-swipe-enter");
        }, 320);
      }

      updateHint();
    });
  }

  function bind() {
    /*
     * IMPORTANT:
     * No touchstart/touchend swipe listeners are registered.
     * This prevents chart zoom/pan gestures from accidentally
     * changing pages.
     */

    const originalShowPage = window.showPage;

    if (
      typeof originalShowPage === "function" &&
      !originalShowPage.__gtxSwipeWrapped
    ) {
      const wrapped = function (page) {
        originalShowPage(page);
        requestAnimationFrame(updateHint);
      };

      wrapped.__gtxSwipeWrapped = true;
      window.showPage = wrapped;
    }

    updateHint();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }

  window.GTXSwipe = {
    next: function () {
      const index = currentIndex();
      if (index >= 0) {
        goTo((index + 1) % sequence.length);
      }
    },

    previous: function () {
      const index = currentIndex();
      if (index >= 0) {
        goTo((index - 1 + sequence.length) % sequence.length);
      }
    },

    refresh: updateHint
  };
})();