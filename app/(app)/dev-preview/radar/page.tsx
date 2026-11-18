import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { RadarApp } from "@/components/radar/radar-app";
import type { RadarPlace } from "@/lib/types";

// Só em desenvolvimento com UI_PREVIEW=1: tela do radar com dados fictícios, para revisar o visual.
// ?modo=busca | resultados  ·  ?lead=<id> abre o painel
export default function RadarPreview(props: PageProps<"/dev-preview/radar">) {
  return (
    <Suspense>
      <Preview {...props} />
    </Suspense>
  );
}

async function Preview({ searchParams }: PageProps<"/dev-preview/radar">) {
  await connection();
  if (process.env.NODE_ENV !== "development" || process.env.UI_PREVIEW !== "1") notFound();
  const sp = await searchParams;
  const mode = sp.modo === "busca" ? "busca" : "resultados";
  const lead = typeof sp.lead === "string" ? sp.lead : undefined;
  return <RadarApp recent={[]} initialSearchId={null} demo={{ places: DEMO, label: "Barbearia · Goiânia · 3 km", category: "barbearia", radiusKm: 3, mode, selectedId: lead }} />;
}

const base = {
  category: "barbearia",
  city: "Goiânia",
  googleMapsUri: "https://maps.google.com",
  auditStatus: "done",
  https: null,
  viewport: null,
  psiPerformance: null,
  hasBooking: false,
  hasServicesPage: null,
  approachable: true,
  oldSite: [] as string[],
  leadId: null,
  leadStage: null,
  optedOut: false,
  googleWebsite: null,
};

const DEMO: RadarPlace[] = [
  { ...base, id: "a", googlePlaceId: "a", name: "Barbearia Navalha de Ouro", address: "R. T-37, 1200", neighborhood: "Setor Bueno", lat: -16.705, lng: -49.27, rating: 4.9, ratingCount: 312, googlePhone: "+55 62 99999-1111", siteType: "sem_site", score: 88,
    rules: [{ block: "A", label: "Sem site", points: 45 }, { block: "B", label: "312 avaliações no Google", points: 10 }, { block: "B", label: "Nota 4.9", points: 5 }, { block: "C", label: "Vive de agenda e não tem agendamento online", points: 12 }, { block: "C", label: "Categoria prioritária da campanha", points: 8 }, { block: "D", label: "Celular/WhatsApp disponível", points: 6 }, { block: "D", label: "Instagram identificado", points: 2 }],
    contacts: [{ kind: "whatsapp", value: "+5562999991111", source: "google_places", confirmed: false }, { kind: "instagram", value: "https://instagram.com/navalhadeouro", source: "site_empresa", confirmed: false }] },
  { ...base, id: "b", googlePlaceId: "b", name: "Barber Club Marista", address: "Av. Ricardo Paranhos, 500", neighborhood: "Setor Marista", lat: -16.71, lng: -49.258, rating: 4.7, ratingCount: 158, googlePhone: "+55 62 98888-2222", siteType: "so_rede_social", score: 83, googleWebsite: "https://instagram.com/barberclub",
    rules: [{ block: "A", label: "Só Instagram/WhatsApp/Linktree como site", points: 40 }, { block: "B", label: "158 avaliações no Google", points: 10 }, { block: "B", label: "Nota 4.7", points: 5 }, { block: "C", label: "Vive de agenda e não tem agendamento online", points: 12 }, { block: "D", label: "Celular/WhatsApp disponível", points: 6 }],
    contacts: [{ kind: "whatsapp", value: "+5562988882222", source: "google_places", confirmed: false }, { kind: "instagram", value: "https://instagram.com/barberclub", source: "site_empresa", confirmed: false }] },
  { ...base, id: "c", googlePlaceId: "c", name: "Corte & Cia Setor Oeste", address: "R. 9, 330", neighborhood: "Setor Oeste", lat: -16.68, lng: -49.27, rating: 4.4, ratingCount: 64, googlePhone: "+55 62 3241-3333", siteType: "site_proprio", googleWebsite: "http://corteecia.com.br", https: false, viewport: false, psiPerformance: 23, hasServicesPage: false, score: 61, oldSite: ["rodapé de 2018", "jQuery 1.11"],
    rules: [{ block: "A", label: "Site não responsivo (sem viewport)", points: 12 }, { block: "A", label: "Site lento no celular (PageSpeed 23)", points: 10 }, { block: "A", label: "Sem HTTPS", points: 6 }, { block: "A", label: "Sem página de serviços", points: 5 }, { block: "B", label: "64 avaliações no Google", points: 7 }, { block: "B", label: "Nota 4.4", points: 3 }, { block: "C", label: "Vive de agenda e não tem agendamento online", points: 12 }],
    contacts: [{ kind: "phone", value: "+556232413333", source: "google_places", confirmed: false }, { kind: "email", value: "contato@corteecia.com.br", source: "site_empresa", confirmed: false }] },
  { ...base, id: "d", googlePlaceId: "d", name: "Studio do Barbeiro", address: "Av. T-9, 2100", neighborhood: "Jardim América", lat: -16.72, lng: -49.285, rating: 4.8, ratingCount: 41, googlePhone: "+55 62 99777-4444", siteType: "sem_site", score: 76, leadId: "x", leadStage: "abordado",
    rules: [{ block: "A", label: "Sem site", points: 45 }], contacts: [{ kind: "whatsapp", value: "+5562997774444", source: "site_empresa", confirmed: true }] },
  { ...base, id: "e", googlePlaceId: "e", name: "Barbearia Clássica Centro", address: "Av. Goiás, 800", neighborhood: "Centro", lat: -16.676, lng: -49.255, rating: 4.1, ratingCount: 22, googlePhone: null, siteType: "site_proprio", googleWebsite: "https://classica.com.br", https: true, viewport: true, psiPerformance: 92, hasServicesPage: true, hasBooking: true, score: 9, approachable: false,
    rules: [{ block: "B", label: "22 avaliações no Google", points: 4 }, { block: "B", label: "Nota 4.1", points: 3 }], contacts: [] },
  { ...base, id: "f", googlePlaceId: "f", name: "Dom Bigode Barber", address: "R. 1136, 45", neighborhood: "Setor Marista", lat: -16.713, lng: -49.262, rating: null, ratingCount: null, googlePhone: "+55 62 99666-5555", siteType: null, auditStatus: "pending", score: null, rules: [],
    contacts: [{ kind: "whatsapp", value: "+5562996665555", source: "google_places", confirmed: false }] },
];
