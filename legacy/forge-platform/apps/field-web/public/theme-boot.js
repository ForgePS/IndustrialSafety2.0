(function () {
  try {
    var k = "forge.field.theme-mode";
    var r = document.documentElement;
    var pref = localStorage.getItem(k);
    if (pref !== "light" && pref !== "dark" && pref !== "system") pref = "system";
    var resolved =
      pref === "light" || pref === "dark"
        ? pref
        : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    r.setAttribute("data-bs-theme", resolved);
    r.setAttribute("data-theme", "theme-default");
    r.classList.toggle("dark-style", resolved === "dark");
    r.classList.toggle("light-style", resolved === "light");
    r.style.colorScheme = resolved;
    r.style.setProperty("--bs-primary", "#696cff");
    r.style.setProperty("--bs-primary-rgb", "105, 108, 255");
  } catch (e) {}
})();
