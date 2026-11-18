import * as cheerio from "cheerio";

import { phoneFromWhatsappLink, parseBrPhone } from "@/lib/phone";

export type SiteType = "sem_site" | "so_rede_social" | "site_proprio";

const SOCIAL_HOSTS = [
  "instagram.com",
  "linktr.ee",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "linkbio.co",
  "bio.link",
  "beacons.ai",
  "linkin.bio",
  "taplink.cc",
];

const BOOKING_HOSTS = [
  "trinks.com",
  "booksy.com",
  "appbarber.com.br",
  "calendly.com",
  "doctoralia.com.br",
  "agendor.com.br",
  "simplesagenda.com.br",
  "avec.app",
  "agendapro.com",
  "fresha.com",
  "belasis.com.br",
  "salaovip.com.br",
  "gendo.app",
];

const MENU_HOSTS = ["ifood.com.br", "goomer.app", "anota.ai", "anotaai.com", "cardapioweb.com", "menudino.com", "aiqfome.com", "delivery.direct"];

const FREE_BUILDERS = ["wixsite.com", "webnode", "site123", "blogspot.com", "wordpress.com", "negocio.site", "business.site", "godaddysites.com"];

const SERVICE_WORDS = ["servico", "servicos", "planos", "tratamento", "tratamentos", "cardapio", "menu", "precos", "procedimento", "procedimentos", "especialidades", "modalidades"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h));
}

export function classifySite(website: string | null | undefined): SiteType {
  if (!website || !website.trim()) return "sem_site";
  const host = hostOf(website.startsWith("http") ? website : `https://${website}`);
  if (!host) return "sem_site";
  return hostMatches(host, SOCIAL_HOSTS) ? "so_rede_social" : "site_proprio";
}

export type HtmlSignals = {
  https: boolean;
  viewport: boolean;
  title: string | null;
  hasMetaDescription: boolean;
  hasH1: boolean;
  hasLocalBusinessLd: boolean;
  seoBasicMissing: boolean;
  hasServicesPage: boolean;
  hasBooking: boolean;
  hasMenu: boolean;
  hasWhatsappButton: boolean;
  hasTelLink: boolean;
  oldSite: string[];
  freeBuilder: boolean;
  contacts: {
    whatsapp: string[]; // E.164 confirmados por link wa.me
    phones: string[]; // E.164 de links tel:
    emails: string[];
    instagram: string[];
    facebook: string[];
  };
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function analyzeHtml(html: string, finalUrl: string, now = new Date()): HtmlSignals {
  const $ = cheerio.load(html);
  const links = $("a[href]")
    .map((_, el) => ({ href: String($(el).attr("href") ?? "").trim(), text: norm($(el).text()) }))
    .get();

  const whatsapp = new Set<string>();
  const phones = new Set<string>();
  const emails = new Set<string>();
  const instagram = new Set<string>();
  const facebook = new Set<string>();
  let hasBooking = false;
  let hasMenu = false;
  let hasServicesPage = false;

  for (const { href, text } of links) {
    const lower = href.toLowerCase();
    if (lower.startsWith("tel:")) {
      const p = parseBrPhone(href.slice(4));
      if (p) phones.add(p.e164);
      continue;
    }
    if (lower.startsWith("mailto:")) {
      const e = href.slice(7).split("?")[0].trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) emails.add(e);
      continue;
    }
    const wa = phoneFromWhatsappLink(href);
    if (wa) whatsapp.add(wa.e164);
    const host = hostOf(href.startsWith("http") ? href : "");
    if (host.endsWith("instagram.com")) {
      const handle = new URL(href).pathname.split("/").filter(Boolean)[0];
      if (handle && !["p", "reel", "explore", "accounts"].includes(handle)) instagram.add(`https://instagram.com/${handle}`);
    }
    if (host.endsWith("facebook.com") && !lower.includes("sharer")) facebook.add(href.split("?")[0]);
    if (host && hostMatches(host, BOOKING_HOSTS)) hasBooking = true;
    if (host && hostMatches(host, MENU_HOSTS)) hasMenu = true;
    const target = norm(href);
    if (SERVICE_WORDS.some((w) => text.includes(w) || target.includes(`/${w}`))) hasServicesPage = true;
    if (/\b(agendar|agende|agendamento|reservar|reserva)\b/.test(text) && !wa) hasBooking = hasBooking || host !== "";
  }

  const bodyText = norm($("body").text());
  if (!hasServicesPage && $("h2, h3").filter((_, el) => SERVICE_WORDS.some((w) => norm($(el).text()).includes(w))).length > 0)
    hasServicesPage = true;
  if ($("form").filter((_, el) => /agend|reserv/.test(norm($(el).text()))).length > 0) hasBooking = true;
  if (/cardapio/.test(bodyText) && $("a, h2, h3").filter((_, el) => /cardapio/.test(norm($(el).text()))).length > 0) hasMenu = true;

  const title = $("title").first().text().trim() || null;
  const hasMetaDescription = Boolean($('meta[name="description"]').attr("content")?.trim());
  const hasH1 = $("h1").length > 0;
  const viewport = $('meta[name="viewport"]').length > 0;
  let hasLocalBusinessLd = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (/LocalBusiness|Restaurant|HealthAndBeautyBusiness|Dentist|ExerciseGym|MedicalClinic|BeautySalon|HairSalon/.test($(el).text()))
      hasLocalBusinessLd = true;
  });
  const titleUseful = Boolean(title && title.length >= 10 && !/^(home|inicio|início|index|untitled)$/i.test(title));

  const oldSite: string[] = [];
  const years = [...bodyText.matchAll(/(?:©|copyright|\(c\))\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g)].map((m) => Number(m[1]));
  const lastYear = years.length ? Math.max(...years) : null;
  if (lastYear && lastYear <= now.getFullYear() - 3) oldSite.push(`rodapé de ${lastYear}`);
  const jq = html.match(/jquery[-.]?(\d)\.(\d+)/i);
  if (jq && Number(jq[1]) < 3) oldSite.push(`jQuery ${jq[1]}.${jq[2]}`);
  if ($("table").length > 3 && $("table td table").length > 0) oldSite.push("layout em tabela");
  if (/\.swf\b|<embed[^>]+flash/i.test(html)) oldSite.push("Flash");

  const finalHost = hostOf(finalUrl);
  const freeBuilder = FREE_BUILDERS.some((b) => finalHost.includes(b));
  if (freeBuilder) oldSite.push("domínio de construtor gratuito");

  return {
    https: finalUrl.startsWith("https://"),
    viewport,
    title,
    hasMetaDescription,
    hasH1,
    hasLocalBusinessLd,
    seoBasicMissing: !titleUseful || !hasMetaDescription || !hasH1,
    hasServicesPage,
    hasBooking,
    hasMenu,
    hasWhatsappButton: whatsapp.size > 0,
    hasTelLink: phones.size > 0,
    oldSite,
    freeBuilder,
    contacts: {
      whatsapp: [...whatsapp],
      phones: [...phones],
      emails: [...emails],
      instagram: [...instagram],
      facebook: [...facebook],
    },
  };
}
