// Categorias do radar → tipos da Places API (New), Table A.
// `types` = lista completa; `coreTypes` = fallback só com tipos antigos/estáveis,
// usado se o Google recusar algum tipo novo (marcados com * na documentação).
export type CategoryId = "barbearia" | "academia" | "restaurante" | "clinica" | "salao";

export type Category = {
  id: CategoryId;
  label: string;
  types: string[];
  coreTypes: string[];
  /** Vive de agenda: sem agendamento online vira oportunidade. */
  agenda: boolean;
};

export const CATEGORIES: Category[] = [
  { id: "barbearia", label: "Barbearia", types: ["barber_shop"], coreTypes: ["barber_shop"], agenda: true },
  { id: "academia", label: "Academia", types: ["gym", "fitness_center"], coreTypes: ["gym"], agenda: true },
  {
    id: "restaurante",
    label: "Restaurante",
    types: ["restaurant", "pizza_restaurant", "brazilian_restaurant", "hamburger_restaurant"],
    coreTypes: ["restaurant"],
    agenda: false,
  },
  {
    id: "clinica",
    label: "Clínica",
    types: ["dentist", "dental_clinic", "doctor", "physiotherapist", "skin_care_clinic", "medical_clinic"],
    coreTypes: ["dentist", "dental_clinic", "doctor", "physiotherapist"],
    agenda: true,
  },
  {
    id: "salao",
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
