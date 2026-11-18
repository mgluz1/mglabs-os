import { describe, expect, it } from "vitest";

import { analyzeHtml, classifySite } from "@/lib/audit/analyze-html";
import { distanceM, gridCover, subdivide } from "@/lib/geo";
import { parseBrPhone, phoneFromWhatsappLink, waLink } from "@/lib/phone";
import { computeScore, type ScoreInput } from "@/lib/score";
import { isFranchise, nameSimilarity } from "@/lib/text";

const GOIANIA = { lat: -16.6869, lng: -49.2648 };

describe("telefone", () => {
  it("reconhece celular de Goiânia em vários formatos", () => {
    for (const raw of ["(62) 99999-8888", "+55 62 99999-8888", "062999998888", "5562999998888"]) {
      const p = parseBrPhone(raw);
      expect(p?.e164).toBe("+5562999998888");
      expect(p?.mobile).toBe(true);
    }
  });
  it("fixo não é celular", () => {
    const p = parseBrPhone("(62) 3241-1234");
    expect(p?.mobile).toBe(false);
    expect(p?.display).toBe("(62) 3241-1234");
  });
  it("rejeita lixo", () => {
    expect(parseBrPhone("123")).toBeNull();
    expect(parseBrPhone("(62) 89999-8888")).toBeNull();
  });
  it("extrai número de link do WhatsApp", () => {
    expect(phoneFromWhatsappLink("https://wa.me/5562999998888")?.e164).toBe("+5562999998888");
    expect(phoneFromWhatsappLink("https://api.whatsapp.com/send?phone=5562999998888&text=oi")?.mobile).toBe(true);
  });
  it("monta wa.me com texto codificado", () => {
    expect(waLink(parseBrPhone("62999998888")!, "Oi, tudo bem?")).toBe("https://wa.me/5562999998888?text=Oi%2C%20tudo%20bem%3F");
  });
});

describe("grade de busca", () => {
  it("raio pequeno = uma chamada", () => {
    expect(gridCover(GOIANIA, 1000)).toHaveLength(1);
  });
  it("cada ponto do círculo de 5 km cai em alguma célula", () => {
    const cells = gridCover(GOIANIA, 5000);
    expect(cells.length).toBeGreaterThan(5);
    expect(cells.length).toBeLessThan(40);
    for (let a = 0; a < 360; a += 15) {
      for (const frac of [0, 0.5, 1]) {
        const rad = (a * Math.PI) / 180;
        const p = {
          lat: GOIANIA.lat + ((5000 * frac * Math.sin(rad)) / 6_371_000) * (180 / Math.PI),
          lng: GOIANIA.lng + ((5000 * frac * Math.cos(rad)) / (6_371_000 * Math.cos((GOIANIA.lat * Math.PI) / 180))) * (180 / Math.PI),
        };
        expect(cells.some((c) => distanceM(c, p) <= c.radius + 1)).toBe(true);
      }
    }
  });
  it("subdivisão cobre a célula original", () => {
    const parent = { ...GOIANIA, radius: 1500 };
    const kids = subdivide(parent);
    expect(kids).toHaveLength(4);
    const edge = { lat: GOIANIA.lat + (1499 / 6_371_000) * (180 / Math.PI), lng: GOIANIA.lng };
    expect(kids.some((c) => distanceM(c, edge) <= c.radius)).toBe(true);
  });
});

describe("texto", () => {
  it("detecta franquia com acento e caixa", () => {
    expect(isFranchise("Academia Smart Fit - Setor Bueno")).toBe(true);
    expect(isFranchise("BLUEFIT Praça do Sol")).toBe(true);
    expect(isFranchise("Barbearia do Zé")).toBe(false);
  });
  it("nomes parecidos", () => {
    expect(nameSimilarity("Barbearia do Zé", "Barbearia do Ze")).toBeGreaterThan(0.85);
    expect(nameSimilarity("Barbearia do Zé", "Academia Fit")).toBeLessThan(0.5);
  });
});

describe("site", () => {
  it("classifica o tipo de site", () => {
    expect(classifySite(null)).toBe("sem_site");
    expect(classifySite("https://www.instagram.com/barbeariadoze")).toBe("so_rede_social");
    expect(classifySite("https://linktr.ee/ze")).toBe("so_rede_social");
    expect(classifySite("https://barbeariadoze.com.br")).toBe("site_proprio");
  });

  it("lê sinais de um site antigo", () => {
    const html = `<html><head><title>Home</title></head><body>
      <a href="https://wa.me/5562999998888">Fale conosco</a>
      <a href="mailto:contato@ze.com.br">E-mail</a>
      <a href="https://instagram.com/barbeariadoze/">Insta</a>
      <footer>© 2019 Barbearia do Zé</footer>
      <script src="/js/jquery-1.12.4.min.js"></script></body></html>`;
    const s = analyzeHtml(html, "http://ze.com.br/", new Date("2026-11-18"));
    expect(s.https).toBe(false);
    expect(s.viewport).toBe(false);
    expect(s.seoBasicMissing).toBe(true);
    expect(s.hasBooking).toBe(false);
    expect(s.hasServicesPage).toBe(false);
    expect(s.contacts.whatsapp).toEqual(["+5562999998888"]);
    expect(s.contacts.emails).toEqual(["contato@ze.com.br"]);
    expect(s.contacts.instagram).toEqual(["https://instagram.com/barbeariadoze"]);
    expect(s.oldSite).toContain("rodapé de 2019");
    expect(s.oldSite.some((x) => x.startsWith("jQuery 1"))).toBe(true);
  });

  it("reconhece site moderno com agendamento e serviços", () => {
    const html = `<html><head><title>Barbearia do Zé — Setor Bueno</title>
      <meta name="viewport" content="width=device-width"><meta name="description" content="Corte e barba">
      </head><body><h1>Barbearia do Zé</h1><a href="/servicos">Serviços</a>
      <a href="https://www.trinks.com/barbeariadoze">Agendar</a><a href="tel:+556232411234">Ligar</a></body></html>`;
    const s = analyzeHtml(html, "https://ze.com.br/", new Date("2026-11-18"));
    expect(s.https && s.viewport && s.hasBooking && s.hasServicesPage && s.hasTelLink).toBe(true);
    expect(s.seoBasicMissing).toBe(false);
  });
});

describe("Lead Score", () => {
  const base: ScoreInput = {
    category: "barbearia",
    siteType: "sem_site",
    rating: 4.8,
    ratingCount: 180,
    hasMobileOrWhatsapp: true,
    hasEmail: false,
    hasInstagram: true,
    hasAnyContact: true,
  };

  it("barbearia sem site, bem avaliada e com WhatsApp é quente", () => {
    const s = computeScore(base);
    expect(s.blockA).toBe(45);
    expect(s.blockB).toBe(15);
    expect(s.blockC).toBe(20);
    expect(s.blockD).toBe(8);
    expect(s.total).toBe(88);
    expect(s.band).toBe("quente");
    expect(s.rules.every((r) => r.label.length > 0)).toBe(true);
  });

  it("site próprio com problemas respeita o teto de 35", () => {
    const s = computeScore({
      ...base,
      siteType: "site_proprio",
      viewport: false,
      psiPerformance: 20,
      https: false,
      hasServicesPage: false,
      seoBasicMissing: true,
      hasWhatsappButton: false,
      hasTelLink: false,
    });
    expect(s.blockA).toBe(35);
  });

  it("sem contato não entra na fila de abordagem", () => {
    const s = computeScore({ ...base, hasMobileOrWhatsapp: false, hasInstagram: false, hasAnyContact: false });
    expect(s.approachable).toBe(false);
    expect(s.blockD).toBe(0);
  });

  it("restaurante com cardápio e site bom fica frio", () => {
    const s = computeScore({
      category: "restaurante",
      siteType: "site_proprio",
      viewport: true,
      psiPerformance: 95,
      https: true,
      hasServicesPage: true,
      seoBasicMissing: false,
      hasWhatsappButton: true,
      hasTelLink: true,
      hasMenu: true,
      rating: 3.9,
      ratingCount: 5,
      hasMobileOrWhatsapp: false,
      hasEmail: false,
      hasInstagram: false,
      hasAnyContact: true,
    });
    expect(s.total).toBe(0);
    expect(s.band).toBe("frio");
  });
});
