(() => {
  const menuButton = document.querySelector(".menu-button");
  const mobileMenu = document.querySelector(".mobile-menu");

  if (!menuButton || !mobileMenu) return;

  if (!menuButton.querySelector(".menu-icon")) {
    const menuIcon = document.createElement("span");
    menuIcon.className = "menu-icon";
    menuIcon.setAttribute("aria-hidden", "true");
    menuButton.append(menuIcon);
  }

  let menuBar = mobileMenu.querySelector(".mobile-menu-bar");
  if (!menuBar) {
    menuBar = document.createElement("div");
    menuBar.className = "mobile-menu-bar";
    menuBar.innerHTML = `
      <a class="mobile-menu-brand" href="index.html" aria-label="LNH 홈">
        <img src="assets/LNH-header-logo.svg" alt="LNH">
      </a>
      <button class="mobile-menu-close" type="button" aria-label="메뉴 닫기"></button>
    `;
    mobileMenu.prepend(menuBar);
  }

  const mobileNav = mobileMenu.querySelector("nav");
  if (mobileNav && !mobileNav.querySelector(".mobile-menu-title")) {
    const menuTitle = document.createElement("p");
    menuTitle.className = "mobile-menu-title";
    menuTitle.textContent = "MENU";
    mobileNav.prepend(menuTitle);
  }

  const closeButton = menuBar.querySelector(".mobile-menu-close");

  let scrim = document.querySelector(".mobile-menu-scrim");
  if (!scrim) {
    scrim = document.createElement("button");
    scrim.type = "button";
    scrim.className = "mobile-menu-scrim";
    scrim.setAttribute("aria-label", "메뉴 닫기");
    mobileMenu.insertAdjacentElement("afterend", scrim);
  }

  const setMenuOpen = (isOpen) => {
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
    mobileMenu.classList.toggle("open", isOpen);
    mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    scrim.classList.toggle("open", isOpen);
    document.body.classList.toggle("menu-open", isOpen);
  };

  menuButton.setAttribute("aria-label", "메뉴 열기");
  menuButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
  }, true);

  closeButton?.addEventListener("click", () => setMenuOpen(false));
  scrim.addEventListener("click", () => setMenuOpen(false));
  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  });
})();
