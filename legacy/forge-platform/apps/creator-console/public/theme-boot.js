(function () {
  try {
    var m = localStorage.getItem("forge-sneat-theme-mode");
    if (m !== "dark" && m !== "light") {
      m =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    }
    var r = document.documentElement;
    r.setAttribute("data-bs-theme", m);
    r.classList.toggle("dark-style", m === "dark");
    r.classList.toggle("light-style", m === "light");
    r.classList.toggle("forge-theme-dark", m === "dark");
    r.classList.toggle("forge-theme-light", m === "light");
    r.style.colorScheme = m;
  } catch (e) {}
})();
