// Ações rápidas de refino de texto (chips do Estúdio). Módulo puro, usado no navegador e no servidor.
export const REFINE_ACTIONS = [
  { id: "encurtar", label: "Encurtar", prompt: "Reescreva mais curta (cerca de 40% menor), mantendo a ideia e a pergunta final." },
  { id: "direta", label: "Mais direta", prompt: "Reescreva indo direto ao ponto, sem rodeios, em no máximo 3 frases." },
  { id: "informal", label: "Mais informal", prompt: "Reescreva num tom mais descontraído e próximo, como conversa de WhatsApp." },
  { id: "profissional", label: "Mais profissional", prompt: "Reescreva num tom mais profissional e cordial, sem ficar formal ou robótico." },
  { id: "pergunta", label: "Pergunta no fim", prompt: "Mantenha o texto e termine com UMA pergunta simples e fácil de responder." },
  { id: "corrigir", label: "Corrigir", prompt: "Corrija apenas ortografia, gramática e pontuação, sem mudar o sentido nem o tom." },
  { id: "expandir", label: "Expandir", prompt: "Reescreva um pouco mais completa (4 a 5 frases), com contexto claro e próximo passo, sem inventar fatos." },
] as const;
export type RefineActionId = (typeof REFINE_ACTIONS)[number]["id"];
