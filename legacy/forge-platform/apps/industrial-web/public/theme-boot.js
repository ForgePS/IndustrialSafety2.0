(function () {
  try {
    var sk = "forge-ind-template-settings";
    var mk = "forge-ind-theme-mode";
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem(sk) || "null");
    } catch (e) {}
    var mode = (s && s.mode) || localStorage.getItem(mk);
    if (mode !== "dark" && mode !== "light" && mode !== "system") mode = "system";
    var resolved =
      mode === "system"
        ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    var r = document.documentElement;
    r.setAttribute("data-bs-theme", resolved);
    r.classList.toggle("dark-style", resolved === "dark");
    r.classList.toggle("light-style", resolved === "light");
    r.style.colorScheme = resolved;
    r.classList.add("layout-menu-fixed");
    if (s) {
      if (s.skin === "bordered" || s.skin === "default") r.setAttribute("data-skin", s.skin);
      if (s.contentWidth === "wide" || s.contentWidth === "compact")
        r.setAttribute("data-content-width", s.contentWidth);
      if (s.direction === "rtl" || s.direction === "ltr") r.setAttribute("dir", s.direction);
      r.classList.toggle("layout-menu-collapsed", s.layout === "collapsed");
      r.classList.toggle("ind-layout-horizontal", s.layout === "horizontal");
      if (typeof s.primaryColor === "string" && /^#([0-9a-fA-F]{6})$/.test(s.primaryColor)) {
        r.style.setProperty("--bs-primary", s.primaryColor);
        var hex = s.primaryColor.slice(1);
        r.style.setProperty(
          "--bs-primary-rgb",
          [0, 2, 4]
            .map(function (i) {
              return parseInt(hex.slice(i, i + 2), 16);
            })
            .join(", "),
        );
        r.style.setProperty("--ind-primary", s.primaryColor);
      }
    } else {
      r.setAttribute("data-skin", "default");
      r.setAttribute("data-content-width", "compact");
    }
  } catch (e) {}
})();
