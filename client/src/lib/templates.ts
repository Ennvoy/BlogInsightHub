export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

const STORAGE_KEY = "bi_email_templates";

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "tpl_marketing",
    name: "行銷邀約",
    subject: "[預設信件主旨] {domain}",
    body: `您好 {bloggerName}，\n\n感謝您持續分享優質內容！\n\n我們看到您關於「{topic}」的文章表現非常出色，認為您是理想的合作夥伴。\n\n誠摯邀請您一起合作...\n\n此為預設範本，實際內容可在系統設定中自訂。\n\n最佳祝福，\n合作團隊`,
  },
  {
    id: "tpl_sponsored",
    name: "業配合作-選衣系_面試",
    subject: "業配邀約：{domain}",
    body: `您好 {bloggerName}，\n\n我們是品牌方，想邀請您參與業配合作...`,
  },
  {
    id: "tpl_recruit",
    name: "主管可機邀約",
    subject: "邀請合作：{domain}",
    body: `您好 {bloggerName}，\n\n我們認為您可能適合我們的計畫...`,
  },
  {
    id: "tpl_data",
    name: "大數據 DE 面試",
    subject: "合作邀請：{domain}",
    body: `您好 {bloggerName}，\n\n我們在找尋大數據相關合作夥伴...`,
  },
];

export function loadTemplates(): EmailTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATES.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TEMPLATES.slice();
    return parsed;
  } catch (e) {
    console.error("loadTemplates error", e);
    return DEFAULT_TEMPLATES.slice();
  }
}

export function saveTemplates(tpls: EmailTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tpls));
    // dispatch custom event so other pages/components update immediately
    try {
      window.dispatchEvent(new CustomEvent("bi:templates:updated", { detail: tpls }));
    } catch (e) {
      // ignore
    }
  } catch (e) {
    console.error("saveTemplates error", e);
  }
}
