// 0.14 (L1): the card's texts in the user's Home Assistant language (English when a text has no translation).
// tools/build.mjs joins this file and the language files of src/i18n into each bundle that uses dfT().
let dfLang = "en";
let dfLoc = "en";
/** Pick the language: "el", "de", "de-CH" → "de"; anything else → English. */
function dfSetLang(lang) {
  const s = String(lang || "en");
  const low = s.toLowerCase();
  dfLoc = s;
  dfLang = DF_I18N[low] ? low : DF_I18N[low.split("-")[0]] ? low.split("-")[0] : "en";
}
/** The language of this Home Assistant user (profile → Language). */
function dfLangOf(hass) {
  if (hass) dfSetLang((hass.locale && hass.locale.language) || hass.language);
}
/** For dates and times: the user's language, so "Mon" / "Δευ" / "Mo." follow it. */
const dfLocale = () => dfLoc;
/** A text by key, with {name} placeholders; a {one, other} text picks its plural from vars.n. */
function dfT(key, vars) {
  let s = (DF_I18N[dfLang] || {})[key];
  if (s == null) s = DF_I18N.en[key];
  if (s == null) return key;
  if (typeof s === "object") {
    let cat = "other";
    try {
      cat = new Intl.PluralRules(dfLang).select(Number(vars && vars.n));
    } catch (_e) {
      cat = "other";
    }
    s = s[cat] ?? s.other;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}
dfSetLang(typeof document !== "undefined" && document.documentElement ? document.documentElement.lang : "en");
