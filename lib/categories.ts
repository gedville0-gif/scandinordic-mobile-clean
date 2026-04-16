import type { Language } from './types';

export interface BusinessCategory {
  id: string;
  order: number;
  active: boolean;
  labels: Record<Language, string>;
}

export const businessCategories: BusinessCategory[] = [
  {
    id: 'consulting',
    order: 1,
    active: true,
    labels: { en: 'Consulting', fi: 'Konsultointi', sv: 'Konsulttjänster', da: 'Konsulentydelser' },
  },
  {
    id: 'development',
    order: 2,
    active: true,
    labels: { en: 'Software Development', fi: 'Ohjelmistokehitys', sv: 'Mjukvaruutveckling', da: 'Softwareudvikling' },
  },
  {
    id: 'design',
    order: 3,
    active: true,
    labels: { en: 'Design & Creative', fi: 'Suunnittelu & Luova työ', sv: 'Design & Kreativt', da: 'Design & Kreativt' },
  },
  {
    id: 'marketing',
    order: 4,
    active: true,
    labels: { en: 'Marketing', fi: 'Markkinointi', sv: 'Marknadsföring', da: 'Marketing' },
  },
  {
    id: 'writing',
    order: 5,
    active: true,
    labels: { en: 'Writing & Content', fi: 'Kirjoittaminen & Sisältö', sv: 'Skrivande & Innehåll', da: 'Skrivning & Indhold' },
  },
  {
    id: 'photography',
    order: 6,
    active: true,
    labels: { en: 'Photography & Video', fi: 'Valokuvaus & Video', sv: 'Foto & Video', da: 'Fotografi & Video' },
  },
  {
    id: 'accounting',
    order: 7,
    active: true,
    labels: { en: 'Accounting & Finance', fi: 'Kirjanpito & Talous', sv: 'Bokföring & Ekonomi', da: 'Regnskab & Finans' },
  },
  {
    id: 'legal',
    order: 8,
    active: true,
    labels: { en: 'Legal Services', fi: 'Lakipalvelut', sv: 'Juridiska tjänster', da: 'Juridiske ydelser' },
  },
  {
    id: 'coaching',
    order: 9,
    active: true,
    labels: { en: 'Coaching & Training', fi: 'Valmennus & Koulutus', sv: 'Coaching & Träning', da: 'Coaching & Træning' },
  },
  {
    id: 'translation',
    order: 10,
    active: true,
    labels: { en: 'Translation', fi: 'Kääntäminen', sv: 'Översättning', da: 'Oversættelse' },
  },
  {
    id: 'sales',
    order: 11,
    active: true,
    labels: { en: 'Sales & Business Dev', fi: 'Myynti & Liiketoiminta', sv: 'Försäljning & Affärsutveckling', da: 'Salg & Forretningsudvikling' },
  },
  {
    id: 'support',
    order: 12,
    active: true,
    labels: { en: 'Customer Support', fi: 'Asiakaspalvelu', sv: 'Kundsupport', da: 'Kundesupport' },
  },
  {
    id: 'hr',
    order: 13,
    active: true,
    labels: { en: 'HR & Recruitment', fi: 'HR & Rekrytointi', sv: 'HR & Rekrytering', da: 'HR & Rekruttering' },
  },
  {
    id: 'it',
    order: 14,
    active: true,
    labels: { en: 'IT & Sysadmin', fi: 'IT & Järjestelmänhallinta', sv: 'IT & Systemadmin', da: 'IT & Systemadmin' },
  },
  {
    id: 'research',
    order: 15,
    active: true,
    labels: { en: 'Research & Analysis', fi: 'Tutkimus & Analyysi', sv: 'Forskning & Analys', da: 'Forskning & Analyse' },
  },
  {
    id: 'other',
    order: 16,
    active: true,
    labels: { en: 'Other', fi: 'Muu', sv: 'Annat', da: 'Andet' },
  },
];

export function getCategoryLabel(id: string, lang: Language): string {
  const cat = businessCategories.find(c => c.id === id);
  if (!cat) return id;
  return cat.labels[lang] ?? cat.labels.en;
}
