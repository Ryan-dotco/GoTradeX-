/* =========================================================
   GOTRADEX PHASE 2
   MOBILE SWIPE NAVIGATION
   ========================================================= */

(function () {
  "use strict";

  const SWIPE_THRESHOLD = 64;
  const MAX_VERTICAL_DRIFT = 90;

  const sequence = [
    { page: "support", title: "Signal Analyzer" },
    { page: "signals", title: "Markets & Assets" },
    { page: "markets", title: "Trading Robot" },
    { page: "robot", title: "Dashboard" },
    { page: "dashboard", title: "Live Chat" }
  ];

  let startX = 0;
  let startY = 0;
  let tracking = false;

  function currentIndex() {
    const page = window.GloDateXSwipePage || window.GTXSwipePage || null;
    const active = document.querySelector(".app-page.active-page");
    const name = page || active?.id?.replace(/^page-/, "") || "";
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
        if (index >= 0) goTo((index + 1) % sequence.length);
      });
      active.appendChild(hint);
    }

    const index = currentIndex();
    if (index < 0) return;

    const next = nextItem(index);
    hint.innerHTML =
      "<span>Swipe / tap for " +
      next.title +
      "</span><b aria-hidden=\"true\">›</b>";
  }

  function goTo(index) {
    const item = sequence[index];
    if (!item || typeof window.showPage !== "function") return;

    window.showPage(item.page);

    requestAnimationFrame(() => {
      updateHint();
    });
  }

  function handleStart(event) {
    if (window.innerWidth > 850) return;
    if (!event.touches || event.touches.length !== 1) {
      tracking = false;
      return;
    }

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  }

  function handleEnd(event) {
    if (!tracking || window.innerWidth > 850) return;
    tracking = false;

    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (
      Math.abs(deltaX) < SWIPE_THRESHOLD ||
      Math.abs(deltaY) > MAX_VERTICAL_DRIFT ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    ) {
      return;
    }

    const index = currentIndex();
    if (index < 0) return;

    if (deltaX < 0) {
      goTo((index + 1) % sequence.length);
    } else {
      goTo((index - 1 + sequence.length) % sequence.length);
    }
  }

  function bind() {
    document.addEventListener("touchstart", handleStart, { passive: true });
    document.addEventListener("touchend", handleEnd, { passive: true });
    document.addEventListener("touchcancel", () => {
      tracking = false;
    }, { passive: true });

    const originalShowPage = window.showPage;
    if (typeof originalShowPage === "function" && !originalShowPage.__gtxSwipeWrapped) {
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
      if (index >= 0) goTo((index + 1) % sequence.length);
    },
    previous: function () {
      const index = currentIndex();
      if (index >= 0) goTo((index - 1 + sequence.length) % sequence.length);
    },
    refresh: updateHint
  };
})();
