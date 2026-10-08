/* Kuul landing page behaviour: hero parallax + portal zoom, cursor dither lens, the menu,
   the four-tab scroll story and the word reveals. Ported from the Component script in
   Claude Design ui_kits/kuul-web/Landing Page.dc.html. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // Headings reveal word by word: wrap each word in a mask, stagger by 70ms.
  $$("[data-split]").forEach(h => {
    const words = h.textContent.trim().split(/\s+/);
    h.textContent = "";
    words.forEach((w, i) => {
      const mask = document.createElement("span"); mask.className = "word-mask";
      const word = document.createElement("span"); word.dataset.w = ""; word.textContent = w;
      word.style.transitionDelay = i * 70 + "ms";
      mask.appendChild(word); h.appendChild(mask);
      if (i < words.length - 1) h.appendChild(document.createTextNode(" "));
    });
  });
  const reveal = (el, on) => {
    $$("[data-w]", el).forEach(w => { w.style.transform = on ? "none" : "translateY(110%)"; });
    $$("[data-fade]", el).forEach(p => { p.style.opacity = on ? "1" : "0"; p.style.transform = on ? "none" : "translateY(var(--space-4))"; });
  };

  // Menu: the whole open/close motion lives in CSS, keyed on data-menu-status. Scrolling is locked while open.
  const header = $("#site-header"), siteMenu = $("#site-menu"), toggles = $$("[data-menu-toggle]");
  const isOpen = () => header.dataset.menuStatus === "open";
  const setMenu = open => {
    header.dataset.menuStatus = open ? "open" : "closed";
    document.documentElement.style.overflow = open ? "hidden" : "";
    toggles.forEach(t => { t.setAttribute("aria-expanded", String(open)); t.setAttribute("aria-label", open ? "Цэс хаах" : "Цэс нээх"); });
    if (open) setTimeout(() => { if (isOpen()) $(".menu-link", siteMenu).focus({ preventScroll: true }); }, 300);
  };
  toggles.forEach(t => t.addEventListener("click", () => setMenu(!isOpen())));
  $$("a", siteMenu).forEach(a => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) { setMenu(false); $(".menu-toggle").focus(); } });

  // Cursor dither lens over the hero photo layers
  const stage = $("#hero-stage"), ditherCanvas = $("#hero-dither");
  const startDither = () => {
    if (!window.KuulDither) return false;
    window.KuulDither.create(stage, ditherCanvas, { pattern: "bayer", pixelSize: 3, radius: 0.22 });
    return true;
  };
  if (!startDither()) { const t = setInterval(() => { if (startDither()) clearInterval(t); }, 100); }

  // Phone previews fit the viewport height
  const tabs = $("#tabs");
  const onResize = () => tabs.style.setProperty("--phone-fit", String(Math.max(0.4, Math.min(0.72, (innerHeight - 96) / 845))));
  addEventListener("resize", onResize); onResize();

  const layers = {};
  $$("[data-layer]").forEach(el => { layers[el.dataset.layer] = el; });
  const track = $("#hero-track"), flash = $("#hero-flash"), dock = $("#hero-dock");
  const copies = $$(".tab-copy", tabs), phones = $$(".tab-phone", tabs), dots = $$(".tab-dots span", tabs);

  const m = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", e => { m.tx = e.clientX / innerWidth - 0.5; m.ty = e.clientY / innerHeight - 0.5; });
  let p = 0, brand, tabIdx, wasCovered = false;
  // Write a style only when its value changed, so an idle hero stops invalidating its layers every frame.
  const written = new Map();
  const set = (el, prop, v) => {
    let w = written.get(el); if (!w) written.set(el, (w = {}));
    if (w[prop] !== v) { w[prop] = v; el.style[prop] = v; }
  };

  const tick = () => {
    m.x += (m.tx - m.x) * 0.06; m.y += (m.ty - m.y) * 0.06;
    const r = track.getBoundingClientRect();
    const target = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    p = Math.abs(target - p) > 0.12 ? target : p + (target - p) * 0.12;
    const e = p * p;
    const flashOp = target < 0.86 ? 0 : Math.max(0, (p - 0.86) / 0.14);
    // Once the flash covers the stage, hide the photo layers so the browser can free their GPU tiles
    // (seven full-screen layers, the portal zoomed 6.5x); they repaint fresh on the way back up.
    const covered = flashOp >= 0.999;
    if (covered !== wasCovered) { wasCovered = covered; stage.classList.toggle("is-covered", covered); }
    if (!covered) {
      const L = (k, depth, zoom, extra) => {
        const el = layers[k]; if (!el) return;
        const px = -m.x * 40 * depth, py = -m.y * 24 * depth;
        set(el, "transform", "translate3d(" + px.toFixed(2) + "px," + (py + (extra || 0)).toFixed(2) + "px,0) scale(" + (1 + e * zoom).toFixed(4) + ")");
      };
      L("sky", 0.15, 0.08); L("title", 0.3, 0.1, -p * innerHeight * 0.35); L("building", 0.4, 0.35); L("sez", 0.3, 0.28); L("shutis", 0.3, 0.28); L("hills", 0.75, 0.9); L("portal", 1.1, 5.5);
      set(layers.title, "opacity", Math.max(0, 1 - p * 2.2).toFixed(3));
      set(dock, "opacity", Math.max(0, 1 - p * 3).toFixed(3));
    }
    set(flash, "opacity", flashOp.toFixed(3));
    set(header, "opacity", isOpen() ? "1" : (1 - flashOp).toFixed(3)); // the white nav fades with the white flash

    // Tabs: one step per 100vh; after the first step the section turns brand violet.
    const H = innerHeight, tr = tabs.getBoundingClientRect();
    const pp = Math.min(0.999, Math.max(0, -tr.top / (tr.height - H))), idx = Math.floor(pp * 4);
    const on = tr.top < H * 0.5 && tr.bottom > H * 0.5 && idx > 0;
    if (on !== brand) { brand = on; tabs.classList.toggle("is-brand", on); }
    if (idx !== tabIdx) {
      tabIdx = idx;
      copies.forEach((el, i) => { el.classList.toggle("is-on", i === idx); reveal(el, i === idx); });
      phones.forEach((el, i) => el.classList.toggle("is-on", i === idx));
      dots.forEach((el, i) => el.classList.toggle("is-on", i === idx));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Sections below reveal once, when a third of them is on screen.
  const rv = $$("[data-reveal]");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) rv.forEach(el => reveal(el, true));
  else {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { reveal(en.target, true); io.unobserve(en.target); } }), { threshold: 0.35 });
    rv.forEach(el => io.observe(el));
  }

  // Waitlist: "Нээгдэхэд мэдэгд" opens an email field; every other CTA scrolls here and opens it too.
  const wl = $("#waitlist"), wlForm = $("#waitlist-form"), wlInput = $("#waitlist-email"), wlNote = $("#waitlist-note");
  const wlOpenBtn = $("[data-waitlist-open]", wl), wlDone = $(".waitlist-done", wl);
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://localhost:4000/v1" : "https://api.kuul.mn/v1";
  const noteText = wlNote.innerHTML;
  const setState = (state, msg) => {
    wl.dataset.state = state;
    wlOpenBtn.setAttribute("aria-expanded", String(state !== "closed"));
    wlInput.setAttribute("aria-invalid", String(state === "error"));
    wlNote.innerHTML = msg || noteText;
  };
  const openWaitlist = focus => {
    if (wl.dataset.state === "closed") setState("open");
    if (focus && wl.dataset.state !== "done") wlInput.focus({ preventScroll: true });
  };
  wlOpenBtn.addEventListener("click", () => openWaitlist(true));
  $$('a[href="#join"]').forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    $("#join").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    openWaitlist(false);
    // Focus once the scroll settles, or the browser jumps there instead.
    const done = () => { removeEventListener("scrollend", done); clearTimeout(t); openWaitlist(true); };
    const t = setTimeout(done, 900);
    addEventListener("scrollend", done);
  }));
  wlInput.addEventListener("input", () => { if (wl.dataset.state === "error") setState("open"); });
  wlForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (wl.dataset.state === "sending") return;
    const email = wlInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setState("error", "Имэйл хаягаа шалгаад дахин оролдоно уу."); wlInput.focus(); return; }
    setState("sending");
    try {
      const res = await fetch(API + "/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website: wlForm.elements.website.value }),
      });
      if (res.ok) {
        $("[data-waitlist-email]", wl).textContent = email.toLowerCase();
        setState("done");
        wlDone.focus({ preventScroll: true });
        return;
      }
      setState("error", res.status === 400 ? "Имэйл хаягаа шалгаад дахин оролдоно уу."
        : res.status === 429 ? "Хэт олон оролдлого. Хэдэн минутын дараа дахин оролдоно уу."
        : "Алдаа гарлаа. Дахин оролдоно уу.");
    } catch {
      setState("error", "Холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.");
    }
    wlInput.focus();
  });
})();
