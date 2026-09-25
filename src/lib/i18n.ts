// App language for the parts an owner sees most: the menu, the header and phone notifications.
// The English text IS the key — anything without a translation falls back to English, so a new
// string never renders blank. Add a line here to translate more of the app.

export type Lang = "en" | "hi" | "te";

export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी (Hindi)" },
  { code: "te", name: "తెలుగు (Telugu)" },
];

export const isLang = (v: unknown): v is Lang => v === "en" || v === "hi" || v === "te";

const HI: Record<string, string> = {
  // Menu
  Analytics: "विश्लेषण",
  CRM: "CRM",
  Productivity: "काम",
  Settings: "सेटिंग्स",
  Dashboard: "डैशबोर्ड",
  "My Dashboard": "मेरा डैशबोर्ड",
  Insights: "रिपोर्ट",
  Leads: "लीड्स",
  "Pipeline Board": "पाइपलाइन बोर्ड",
  "Cold Leads": "ठंडी लीड्स",
  "Follow-ups": "फॉलो-अप",
  Meetings: "मीटिंग",
  Automations: "ऑटोमेशन",
  Sequences: "सीक्वेंस",
  Sources: "लीड स्रोत",
  // Header
  "Search leads, team members, or jump to…": "लीड, टीम या पेज खोजें…",
  "Quick Add": "लीड जोड़ें",
  // Notifications
  "New lead: {name}": "नई लीड: {name}",
  "Follow-up due: {title}": "फॉलो-अप का समय: {title}",
  "Follow up with {name} ({type})": "{name} से फॉलो-अप करें ({type})",
  "Overdue: {title}": "समय निकल गया: {title}",
  "Follow-up with {name} was due and hasn't been done.": "{name} का फॉलो-अप अभी बाकी है।",
  "Lead not contacted yet": "लीड से अभी तक संपर्क नहीं हुआ",
  "{name} has been waiting over {hours}h. Reply now before they go cold.": "{name} {hours} घंटे से इंतज़ार कर रहे हैं। अभी जवाब दें।",
  "Unassigned lead not contacted": "लीड किसी को सौंपी नहीं गई",
  "{name} has been waiting over {hours}h and nobody owns it. Assign it now.": "{name} {hours} घंटे से इंतज़ार कर रहे हैं और लीड किसी को सौंपी नहीं गई। अभी सौंपें।",
  "☀️ Good morning": "☀️ सुप्रभात",
  "☀️ Good morning, {name}": "☀️ सुप्रभात, {name}",
  "Follow-ups due today: {n}": "आज के फॉलो-अप: {n}",
  "Overdue follow-ups: {n}": "बकाया फॉलो-अप: {n}",
  "New leads since yesterday: {n}": "कल से नई लीड्स: {n}",
};

const TE: Record<string, string> = {
  // Menu
  Analytics: "విశ్లేషణ",
  CRM: "CRM",
  Productivity: "పని",
  Settings: "సెట్టింగ్‌లు",
  Dashboard: "డాష్‌బోర్డ్",
  "My Dashboard": "నా డాష్‌బోర్డ్",
  Insights: "నివేదికలు",
  Leads: "లీడ్స్",
  "Pipeline Board": "పైప్‌లైన్ బోర్డ్",
  "Cold Leads": "చల్లబడిన లీడ్స్",
  "Follow-ups": "ఫాలో-అప్‌లు",
  Meetings: "మీటింగ్‌లు",
  Automations: "ఆటోమేషన్‌లు",
  Sequences: "సీక్వెన్స్‌లు",
  Sources: "లీడ్ మూలాలు",
  // Header
  "Search leads, team members, or jump to…": "లీడ్స్, టీమ్ లేదా పేజీ వెతకండి…",
  "Quick Add": "లీడ్ జోడించండి",
  // Notifications
  "New lead: {name}": "కొత్త లీడ్: {name}",
  "Follow-up due: {title}": "ఫాలో-అప్ సమయం: {title}",
  "Follow up with {name} ({type})": "{name}తో ఫాలో-అప్ చేయండి ({type})",
  "Overdue: {title}": "సమయం దాటింది: {title}",
  "Follow-up with {name} was due and hasn't been done.": "{name}తో ఫాలో-అప్ ఇంకా చేయలేదు.",
  "Lead not contacted yet": "లీడ్‌ను ఇంకా సంప్రదించలేదు",
  "{name} has been waiting over {hours}h. Reply now before they go cold.": "{name} {hours} గంటలుగా ఎదురుచూస్తున్నారు. ఇప్పుడే జవాబు ఇవ్వండి.",
  "Unassigned lead not contacted": "లీడ్ ఎవరికీ కేటాయించలేదు",
  "{name} has been waiting over {hours}h and nobody owns it. Assign it now.": "{name} {hours} గంటలుగా ఎదురుచూస్తున్నారు, ఎవరికీ కేటాయించలేదు. ఇప్పుడే కేటాయించండి.",
  "☀️ Good morning": "☀️ శుభోదయం",
  "☀️ Good morning, {name}": "☀️ శుభోదయం, {name}",
  "Follow-ups due today: {n}": "ఈరోజు ఫాలో-అప్‌లు: {n}",
  "Overdue follow-ups: {n}": "బాకీ ఫాలో-అప్‌లు: {n}",
  "New leads since yesterday: {n}": "నిన్నటి నుండి కొత్త లీడ్స్: {n}",
};

const DICT: Record<Lang, Record<string, string> | null> = { en: null, hi: HI, te: TE };

/** Translate `text` (the English source) into `lang`, filling {placeholders} from `vars`. */
export function t(lang: Lang | string | null | undefined, text: string, vars?: Record<string, string | number>): string {
  const tpl = (isLang(lang) && DICT[lang]?.[text]) || text;
  return vars ? tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : tpl;
}
