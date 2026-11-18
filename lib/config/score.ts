// Pesos do Lead Score (0–100). Ajuste aqui e mude WEIGHTS_VERSION.
export const WEIGHTS_VERSION = "v2";

export const WEIGHTS = {
  A: {
    max: 45,
    semSite: 45,
    soRedeSocial: 40,
    siteCap: 35,
    semViewport: 12,
    psiRuim: 10, // < 50
    psiMedio: 5, // 50–89
    semHttps: 6,
    semServicos: 5,
    seoAusente: 4,
    semBotaoContato: 3,
  },
  B: {
    max: 25,
    avaliacoes100: 10,
    avaliacoes30: 7,
    avaliacoes10: 4,
    nota45: 5,
    nota40: 3,
    // sem Google (dados do Overture)
    confianca90: 12,
    confianca75: 7,
    variasFontes: 6,
  },
  C: {
    max: 20,
    agendaSemAgendamento: 12,
    restauranteSemCardapio: 12,
    categoriaPrioritaria: 8,
  },
  D: {
    max: 10,
    whatsapp: 6,
    email: 2,
    instagram: 2,
  },
} as const;

/** Categorias marcadas como prioritárias na campanha atual (+8 no bloco C). */
export const PRIORITY_CATEGORIES: string[] = ["barbearia", "salao"];

export const BANDS = { quente: 75, morno: 50 } as const;
