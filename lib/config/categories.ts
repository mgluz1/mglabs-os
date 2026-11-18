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
  /** Termos da taxonomia do Overture (basic_category, taxonomy.primary ou hierarquia). Igual ao scripts/overture_ingest.py. */
  overtureTerms: string[];
  /** basic_category do Overture a deixar de fora (ex.: laboratórios na categoria clínica). */
  overtureExclude?: string[];
};

export const CATEGORIES: Category[] = [
  { id: "barbearia", plural: "barbearias", label: "Barbearia", types: ["barber_shop"], coreTypes: ["barber_shop"], agenda: true, overtureTerms: ["barber"] },
  { id: "academia", plural: "academias", label: "Academia", types: ["gym", "fitness_center"], coreTypes: ["gym"], agenda: true, overtureTerms: ["gym", "fitness_studio", "martial_arts_club", "fitness_trainer"] },
  {
    id: "restaurante",
    plural: "restaurantes",
    label: "Restaurante",
    types: ["restaurant", "pizza_restaurant", "brazilian_restaurant", "hamburger_restaurant"],
    coreTypes: ["restaurant"],
    agenda: false,
    overtureTerms: ["restaurant", "fast_food_restaurant"],
  },
  {
    id: "clinica",
    plural: "clínicas",
    label: "Clínica",
    types: ["dentist", "dental_clinic", "doctor", "physiotherapist", "skin_care_clinic", "medical_clinic"],
    coreTypes: ["dentist", "dental_clinic", "doctor", "physiotherapist"],
    agenda: true,
    overtureTerms: ["outpatient_care_facility", "specialized_health_care", "behavioral_or_mental_health_clinic", "vision_or_eye_care_clinic", "pediatric_clinic", "medical_spa"],
    overtureExclude: ["diagnostics_imaging_or_lab_service", "hospital"],
  },
  {
    id: "salao",
    plural: "salões de beleza",
    label: "Salão de beleza",
    types: ["hair_salon", "beauty_salon", "nail_salon", "hair_care", "beautician"],
    coreTypes: ["hair_salon", "beauty_salon", "nail_salon"],
    agenda: true,
    overtureTerms: ["beauty_salon", "hair_salon", "nail_salon", "skin_care_and_makeup", "eyebrow_service", "eyelash_service"],
  },
];

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export const CITIES = [
  { id: "goiania", label: "Goiânia", lat: -16.6869, lng: -49.2648 },
  { id: "aparecida", label: "Aparecida de Goiânia", lat: -16.8198, lng: -49.2442 },
] as const;
