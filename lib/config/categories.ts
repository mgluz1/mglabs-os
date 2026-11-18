// Categorias do radar → tipos da Places API (New), Table A.
// `types` = lista completa; `coreTypes` = fallback só com tipos antigos/estáveis,
// usado se o Google recusar algum tipo novo (marcados com * na documentação).
export type CategoryId = "barbearia" | "academia" | "restaurante" | "clinica" | "salao";

export type Category = {
  id: CategoryId;
  label: string;
  /** Plural em minúsculas, para frases ("12 barbearias no radar"). */
  plural: string;
  types: string[];
  coreTypes: string[];
  /** Vive de agenda: sem agendamento online vira oportunidade. */
  agenda: boolean;
};

export const CATEGORIES: Category[] = [
  { id: "barbearia", plural: "barbearias", label: "Barbearia", types: ["barber_shop"], coreTypes: ["barber_shop"], agenda: true },
  { id: "academia", plural: "academias", label: "Academia", types: ["gym", "fitness_center"], coreTypes: ["gym"], agenda: true },
  {
    id: "restaurante",
    plural: "restaurantes",
    label: "Restaurante",
    types: ["restaurant", "pizza_restaurant", "brazilian_restaurant", "hamburger_restaurant"],
    coreTypes: ["restaurant"],
    agenda: false,
  },
  {
    id: "clinica",
    plural: "clínicas",
    label: "Clínica",
    types: ["dentist", "dental_clinic", "doctor", "physiotherapist", "skin_care_clinic", "medical_clinic"],
    coreTypes: ["dentist", "dental_clinic", "doctor", "physiotherapist"],
    agenda: true,
  },
  {
    id: "salao",
    plural: "salões de beleza",
    label: "Salão de beleza",
    types: ["hair_salon", "beauty_salon", "nail_salon", "hair_care", "beautician"],
    coreTypes: ["hair_salon", "beauty_salon", "nail_salon"],
    agenda: true,
  },
];

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export const CITIES = [
  { id: "goiania", label: "Goiânia", lat: -16.6869, lng: -49.2648 },
  { id: "aparecida", label: "Aparecida de Goiânia", lat: -16.8198, lng: -49.2442 },
] as const;
