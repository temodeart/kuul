# kuul.mn landing page

Static site: plain HTML, CSS and JS, no build step. The design is Claude Design
"Kuul App Design", `ui_kits/kuul-web/Landing Page.dc.html`.

```bash
python3 -m http.server 8080   # from the site folder, then open http://localhost:8080
```

- `css/colors.css`, `typography.css`, `spacing.css`, `effects.css` are copied
  unchanged from `design_reference/tokens/`. Page styles are in `css/landing.css`.
- `js/kuul-dither.js` is the design's cursor dither lens, copied unchanged.
  `js/landing.js` ports the page's behaviour (parallax, portal zoom, menu, the
  four-tab scroll story, word reveals).
- Onest is served from `fonts/` (copied from `mobile/assets/fonts`), because the
  Google Fonts copy lacks Ө ө Ү ү. Icons are Material Symbols Rounded from Google
  Fonts, trimmed to the three the page uses (`icon_names=`).
- `assets/layers/` holds the hero photo layers from the design export
  (`assets/web/layers/`).
- `assets/phones/` are renders of the design's `AppPreview` (Хуваарь, Групп,
  Кампус, Би, light) at 2x, with a 40px transparent margin for the shadow.
  Re-render them when those app screens change in the design.
- `terms/` and `privacy/` (kuul.mn/terms, kuul.mn/privacy, English under `en/`) are
  generated: don't edit their `index.html`. The text comes from the Claude doc "Kuul — Terms
  of Use & Privacy Policy (draft)", MN and EN tabs, exported as Markdown into `legal/*.mn.md`
  and `legal/*.en.md`. The layout
  is the design's `ui_kits/kuul-web/Legal.dc.html`. After updating the Markdown:
  `python3 tools/build_legal.py` (from the site folder).
- "Нээгдэхэд мэдэгд" opens an email field (`#waitlist` in `index.html`, bottom of
  `js/landing.js`) that posts to `https://api.kuul.mn/v1/waitlist`. The API allows kuul.mn
  across origins for the waitlist routes only. `unsubscribe/` is where the link in waitlist
  emails lands; it unsubscribes only when the button is pressed, because mail scanners open
  every link.
