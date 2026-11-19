import { normalize } from "@/lib/text";

// Categorias do radar → taxonomia aberta do Overture Maps + termos de fallback.
export type CategoryId =
  | "barbearia"
  | "salao"
  | "dentista"
  | "estetica"
  | "petshop"
  | "academia"
  | "restaurante"
  | "pizzaria"
  | "clinica"
  | "cafeteria"
  | "oficina"
  | "imobiliaria"
  | "escritorio"
  | "comercio";

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
  /** Sinônimos e termos buscáveis em "Para quem". */
  keywords: string[];
  /** Filtro opcional por nome quando o termo Overture é abrangente (ex.: pizzaria dentro de restaurant). */
  nameKeywords?: string[];
  /** Aparece entre os chips rápidos na tela inicial do Radar. */
  featured?: boolean;
};

export const CATEGORIES: Category[] = [
  {
    id: "barbearia",
    plural: "barbearias",
    label: "Barbearia",
    types: ["barber_shop"],
    coreTypes: ["barber_shop"],
    agenda: true,
    overtureTerms: ["barber"],
    keywords: ["barba", "cabelo masculino", "barbeiro", "navalha"],
    featured: true,
  },
  {
    id: "salao",
    plural: "salões de beleza",
    label: "Salão de beleza",
    types: ["hair_salon", "beauty_salon", "nail_salon", "hair_care", "beautician"],
    coreTypes: ["hair_salon", "beauty_salon", "nail_salon"],
    agenda: true,
    overtureTerms: ["beauty_salon", "hair_salon", "nail_salon", "skin_care_and_makeup", "eyebrow_service", "eyelash_service"],
    keywords: ["cabeleireiro", "manicure", "pedicure", "sobrancelha", "cilios", "studio de beleza"],
    featured: true,
  },
  {
    id: "dentista",
    plural: "clínicas odontológicas",
    label: "Dentista",
    types: ["dentist", "dental_clinic"],
    coreTypes: ["dentist", "dental_clinic"],
    agenda: true,
    overtureTerms: ["dentist", "dental_clinic", "orthodontist", "cosmetic_dentist", "endodontist", "specialized_health_care"],
    nameKeywords: ["dent", "odonto", "ortodont", "implante", "sorriso", "oral", "endodont"],
    keywords: ["odontologia", "ortodontia", "implante", "clínica odontológica", "odonto"],
    featured: true,
  },
  {
    id: "estetica",
    plural: "clínicas de estética",
    label: "Estética",
    types: ["skin_care_clinic", "beauty_salon", "spa"],
    coreTypes: ["skin_care_clinic", "spa"],
    agenda: true,
    overtureTerms: ["medical_spa", "skin_care_and_makeup", "day_spa", "spa", "eyebrow_service", "eyelash_service", "laser_hair_removal_service"],
    keywords: ["harmonizacao", "spa", "depilacao", "limpeza de pele", "biomedicina estetica", "laser"],
    featured: true,
  },
  {
    id: "petshop",
    plural: "pet shops e vets",
    label: "Pet shop",
    types: ["pet_store", "veterinary_care"],
    coreTypes: ["pet_store", "veterinary_care"],
    agenda: true,
    overtureTerms: ["pet_store", "pet_groomer", "veterinarian", "animal_hospital", "pet_services"],
    keywords: ["veterinario", "veterinaria", "banho e tosa", "pet", "cachorro", "gato", "clinica veterinaria"],
    featured: true,
  },
  {
    id: "academia",
    plural: "academias",
    label: "Academia",
    types: ["gym", "fitness_center"],
    coreTypes: ["gym"],
    agenda: true,
    overtureTerms: ["gym", "fitness_studio", "martial_arts_club", "fitness_trainer", "pilates_studio", "yoga_studio"],
    keywords: ["crossfit", "pilates", "musculacao", "funcional", "luta", "fitness", "yoga"],
    featured: true,
  },
  {
    id: "restaurante",
    plural: "restaurantes",
    label: "Restaurante",
    types: ["restaurant", "brazilian_restaurant"],
    coreTypes: ["restaurant"],
    agenda: false,
    overtureTerms: ["restaurant", "fast_food_restaurant"],
    keywords: ["comida", "bistro", "churrascaria", "almoco", "jantar", "gastronomia"],
    featured: true,
  },
  {
    id: "pizzaria",
    plural: "pizzarias e hamburguerias",
    label: "Pizzaria",
    types: ["pizza_restaurant", "hamburger_restaurant", "fast_food_restaurant"],
    coreTypes: ["pizza_restaurant", "restaurant"],
    agenda: false,
    overtureTerms: ["pizza_restaurant", "burger_restaurant", "fast_food_restaurant", "restaurant"],
    nameKeywords: ["pizz", "hamb", "burger", "burguer", "lanch", "esfiha", "sushi", "temaki"],
    keywords: ["pizza", "hamburgueria", "burger", "lanchonete", "delivery", "sushi"],
    featured: true,
  },
  {
    id: "clinica",
    plural: "clínicas médicas",
    label: "Clínica médica",
    types: ["doctor", "physiotherapist", "medical_clinic"],
    coreTypes: ["doctor", "physiotherapist"],
    agenda: true,
    overtureTerms: ["outpatient_care_facility", "specialized_health_care", "behavioral_or_mental_health_clinic", "vision_or_eye_care_clinic", "pediatric_clinic", "physical_therapy"],
    overtureExclude: ["diagnostics_imaging_or_lab_service", "hospital"],
    keywords: ["medico", "fisioterapia", "psicologia", "nutricao", "oftalmo", "saude", "consultorio"],
  },
  {
    id: "cafeteria",
    plural: "cafeterias e padarias",
    label: "Cafeteria e Padaria",
    types: ["cafe", "bakery", "coffee_shop"],
    coreTypes: ["cafe", "bakery"],
    agenda: false,
    overtureTerms: ["cafe", "coffee_shop", "bakery", "pastry_shop", "dessert_shop"],
    keywords: ["cafe", "padaria", "confeitaria", "doceria", "panificadora", "bolo"],
  },
  {
    id: "oficina",
    plural: "oficinas e auto centers",
    label: "Oficina e Auto",
    types: ["car_repair", "car_wash"],
    coreTypes: ["car_repair"],
    agenda: true,
    overtureTerms: ["automotive_repair", "auto_repair", "car_wash", "auto_detailing", "tire_shop"],
    keywords: ["mecanica", "funilaria", "lava jato", "pneu", "automotivo", "estetica automotiva"],
  },
  {
    id: "imobiliaria",
    plural: "imobiliárias",
    label: "Imobiliária",
    types: ["real_estate_agency"],
    coreTypes: ["real_estate_agency"],
    agenda: true,
    overtureTerms: ["real_estate_agent", "real_estate_agency", "commercial_real_estate", "property_management"],
    keywords: ["corretor", "imoveis", "aluguel", "apartamento", "loteamento"],
  },
  {
    id: "escritorio",
    plural: "escritórios e consultorias",
    label: "Advocacia e Contabilidade",
    types: ["lawyer", "accounting"],
    coreTypes: ["lawyer", "accounting"],
    agenda: true,
    overtureTerms: ["lawyer", "legal_services", "accountant", "accounting_service", "tax_service"],
    keywords: ["advogado", "advocacia", "contabilidade", "contador", "consultoria", "juridico"],
  },
  {
    id: "comercio",
    plural: "lojas locais",
    label: "Comércio e Lojas",
    types: ["clothing_store", "shoe_store", "store"],
    coreTypes: ["store"],
    agenda: false,
    overtureTerms: ["clothing_store", "shoe_store", "optician", "furniture_store", "jewelry_store", "home_goods_store"],
    keywords: ["loja", "moda", "roupa", "otica", "calcados", "decoracao", "joalheria"],
  },
];

export const FEATURED_CATEGORIES = CATEGORIES.filter((c) => c.featured);

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function categoryLabel(id: string | null | undefined): string {
  if (!id) return "Negócio";
  if (id.startsWith("q:")) return id.slice(2);
  return getCategory(id)?.label ?? id;
}

/** Busca categorias por nome, plural ou palavras-chave (sem acento). */
export function searchCategories(query: string): Category[] {
  const q = normalize(query);
  if (!q) return CATEGORIES;
  return CATEGORIES.filter(
    (c) =>
      normalize(c.label).includes(q) ||
      normalize(c.plural).includes(q) ||
      c.keywords.some((k) => normalize(k).includes(q)),
  );
}

export const CITIES = [
  { id: "goiania", label: "Goiânia", lat: -16.6869, lng: -49.2648 },
  { id: "aparecida", label: "Aparecida de Goiânia", lat: -16.8198, lng: -49.2442 },
] as const;
