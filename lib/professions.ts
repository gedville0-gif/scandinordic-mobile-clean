export type ProfessionId =
  | 'driver_courier'
  | 'consultant'
  | 'developer_it'
  | 'designer'
  | 'cleaner'
  | 'tradesperson'
  | 'photographer'
  | 'trainer_coach'
  | 'hairdresser'
  | 'online_shop'
  | 'retailer'
  | 'food_producer'
  | 'craftsperson'
  | 'construction'
  | 'restaurant'
  | 'cleaning_company'
  | 'transport_company'
  | 'security'
  | 'artist_musician'
  | 'healthcare'
  | 'other';

export type FeatureId =
  | 'mileage'
  | 'invoicing'
  | 'vat_report'
  | 'financial_dashboard'
  | 'time_tracking'
  | 'ai_assistant'
  | 'payroll'
  | 'inventory'
  | 'receipt_scan'
  | 'tax_prepayment';

export type FeatureStatus = 'key' | 'enabled' | 'hidden';
export type FeatureMap = Record<FeatureId, FeatureStatus>;

export type ProfessionCategory = 'services' | 'products' | 'team' | 'creative';

export interface Profession {
  id: ProfessionId;
  name: string;
  description: string;
  icon: string;
  category: ProfessionCategory;
  tagline: string;
}

export interface Feature {
  id: FeatureId;
  name: string;
  emoji: string;
  description: string;
}

export const FEATURES: Feature[] = [
  { id: 'mileage',             name: 'Mileage & Tax Deductions', emoji: '🚗', description: 'Track km, calculate deductions' },
  { id: 'invoicing',           name: 'Invoice & Billing',        emoji: '🧾', description: 'Create and send invoices' },
  { id: 'vat_report',          name: 'VAT Report (OmaVero)',      emoji: '🗂️', description: 'VAT summaries for tax filing' },
  { id: 'financial_dashboard', name: 'Financial Dashboard',      emoji: '📊', description: 'Income, expenses, net profit' },
  { id: 'time_tracking',       name: 'Time Tracking',            emoji: '⏱️', description: 'Log hours and sessions' },
  { id: 'ai_assistant',        name: 'AI Financial Assistant',   emoji: '🤖', description: 'Smart financial insights' },
  { id: 'payroll',             name: 'Worker Payroll',           emoji: '👷', description: 'Pay and manage workers' },
  { id: 'inventory',           name: 'Inventory Management',     emoji: '📦', description: 'Track stock and products' },
  { id: 'receipt_scan',        name: 'Receipt Scan',             emoji: '📷', description: 'Scan and store receipts' },
  { id: 'tax_prepayment',      name: 'Tax Prepayment Tracker',   emoji: '🏛️', description: 'Estimate and plan tax payments' },
];

export const PROFESSIONS: Profession[] = [
  { id: 'driver_courier',   name: 'Driver / Courier',   description: 'Taxi, delivery, transport', icon: '🚗', category: 'services', tagline: 'Perfect for drivers!' },
  { id: 'consultant',       name: 'Consultant',          description: 'Freelance, advisor',         icon: '💼', category: 'services', tagline: 'Built for consultants!' },
  { id: 'developer_it',     name: 'Developer / IT',      description: 'Software, web, tech',        icon: '💻', category: 'services', tagline: 'Ready for developers!' },
  { id: 'designer',         name: 'Designer',            description: 'Graphic, web, interior',     icon: '🎨', category: 'services', tagline: 'Set up for designers!' },
  { id: 'cleaner',          name: 'Cleaner',             description: 'Home, office, industrial',   icon: '🧹', category: 'services', tagline: 'Ready for cleaners!' },
  { id: 'tradesperson',     name: 'Tradesperson',        description: 'Plumber, electrician',       icon: '🔧', category: 'services', tagline: 'Built for tradespeople!' },
  { id: 'photographer',     name: 'Photographer',        description: 'Photo, video, media',        icon: '📸', category: 'services', tagline: 'Set up for photographers!' },
  { id: 'trainer_coach',    name: 'Trainer / Coach',     description: 'Fitness, life, business',    icon: '🏋️', category: 'services', tagline: 'Perfect for coaches!' },
  { id: 'hairdresser',      name: 'Hairdresser',         description: 'Barber, beauty, salon',      icon: '✂️', category: 'services', tagline: 'Ready for beauty pros!' },
  { id: 'online_shop',      name: 'Online Shop',         description: 'E-commerce, Etsy',           icon: '🛍️', category: 'products', tagline: 'Ready for your shop!' },
  { id: 'retailer',         name: 'Retailer',            description: 'Physical store, kiosk',      icon: '🪟', category: 'products', tagline: 'Built for retailers!' },
  { id: 'food_producer',    name: 'Food Producer',       description: 'Cottage food, farm',         icon: '🍯', category: 'products', tagline: 'Ready for food producers!' },
  { id: 'craftsperson',     name: 'Craftsperson',        description: 'Artisan, maker, craft',      icon: '🪵', category: 'products', tagline: 'Set up for craftspeople!' },
  { id: 'construction',     name: 'Construction',        description: 'Building, renovation',       icon: '🏗️', category: 'team',     tagline: 'Built for construction!' },
  { id: 'restaurant',       name: 'Restaurant',          description: 'Café, catering, food',       icon: '🍽️', category: 'team',     tagline: 'Ready for your restaurant!' },
  { id: 'cleaning_company', name: 'Cleaning Co.',        description: 'Company with workers',       icon: '🧽', category: 'team',     tagline: 'Built for cleaning companies!' },
  { id: 'transport_company',name: 'Transport Co.',       description: 'Logistics, moving',          icon: '🚛', category: 'team',     tagline: 'Ready for transport!' },
  { id: 'security',         name: 'Security',            description: 'Guard, surveillance',        icon: '🛡️', category: 'team',     tagline: 'Set up for security!' },
  { id: 'artist_musician',  name: 'Artist / Musician',   description: 'Creative, performer',        icon: '🎵', category: 'creative', tagline: 'Ready for creatives!' },
  { id: 'healthcare',       name: 'Healthcare',          description: 'Therapist, private care',    icon: '💊', category: 'creative', tagline: 'Set up for healthcare!' },
  { id: 'other',            name: 'Other',               description: 'Not listed above',           icon: '⭐', category: 'creative', tagline: 'Customised for you!' },
];

export const CATEGORY_LABELS: Record<ProfessionCategory, string> = {
  services: '🛠️ Services',
  products: '📦 Products',
  team:     '👥 Team Business',
  creative: '🎨 Creative & Other',
};

const ALL_FEATURES: FeatureId[] = [
  'mileage','invoicing','vat_report','financial_dashboard',
  'time_tracking','ai_assistant','payroll','inventory','receipt_scan','tax_prepayment',
];

function buildMap(key: FeatureId[], enabled: FeatureId[]): FeatureMap {
  const map = {} as FeatureMap;
  for (const f of ALL_FEATURES) {
    if (key.includes(f))          map[f] = 'key';
    else if (enabled.includes(f)) map[f] = 'enabled';
    else                          map[f] = 'hidden';
  }
  return map;
}

export const PROFESSION_FEATURES: Record<ProfessionId, FeatureMap> = {
  driver_courier:   buildMap(['mileage','invoicing'],               ['vat_report','financial_dashboard','time_tracking','ai_assistant','receipt_scan','tax_prepayment']),
  consultant:       buildMap(['invoicing','ai_assistant'],          ['vat_report','financial_dashboard','time_tracking','mileage','receipt_scan','tax_prepayment']),
  developer_it:     buildMap(['invoicing','ai_assistant'],          ['vat_report','financial_dashboard','time_tracking','mileage','tax_prepayment']),
  designer:         buildMap(['invoicing'],                         ['vat_report','financial_dashboard','time_tracking','ai_assistant','receipt_scan']),
  cleaner:          buildMap(['mileage','invoicing'],               ['vat_report','financial_dashboard','time_tracking','receipt_scan']),
  tradesperson:     buildMap(['invoicing','mileage'],               ['vat_report','financial_dashboard','time_tracking','receipt_scan','tax_prepayment']),
  photographer:     buildMap(['invoicing'],                         ['vat_report','financial_dashboard','time_tracking','mileage','receipt_scan']),
  trainer_coach:    buildMap(['invoicing','time_tracking'],         ['vat_report','financial_dashboard','ai_assistant','tax_prepayment']),
  hairdresser:      buildMap(['invoicing'],                         ['vat_report','financial_dashboard','time_tracking','receipt_scan']),
  online_shop:      buildMap(['inventory','invoicing'],             ['vat_report','financial_dashboard','ai_assistant','receipt_scan','tax_prepayment']),
  retailer:         buildMap(['inventory','invoicing'],             ['vat_report','financial_dashboard','receipt_scan']),
  food_producer:    buildMap(['inventory'],                         ['invoicing','vat_report','financial_dashboard','receipt_scan']),
  craftsperson:     buildMap(['inventory','invoicing'],             ['vat_report','financial_dashboard','receipt_scan']),
  construction:     buildMap(['payroll','time_tracking','mileage'], ['invoicing','vat_report','financial_dashboard','receipt_scan','tax_prepayment']),
  restaurant:       buildMap(['payroll','time_tracking'],           ['invoicing','vat_report','financial_dashboard','inventory','receipt_scan']),
  cleaning_company: buildMap(['payroll','time_tracking'],           ['invoicing','vat_report','financial_dashboard','mileage','receipt_scan']),
  transport_company:buildMap(['payroll','mileage'],                 ['invoicing','vat_report','financial_dashboard','time_tracking','receipt_scan']),
  security:         buildMap(['payroll','time_tracking'],           ['invoicing','vat_report','financial_dashboard','tax_prepayment']),
  artist_musician:  buildMap(['invoicing'],                         ['vat_report','financial_dashboard','ai_assistant','receipt_scan']),
  healthcare:       buildMap(['invoicing','time_tracking'],         ['vat_report','financial_dashboard','ai_assistant','receipt_scan','tax_prepayment']),
  other:            buildMap([],                                    ['mileage','invoicing','vat_report','financial_dashboard','time_tracking','ai_assistant','receipt_scan','tax_prepayment']),
};

export const FEATURE_ORDER: FeatureId[] = [
  'mileage','invoicing','vat_report','financial_dashboard',
  'time_tracking','ai_assistant','payroll','inventory','receipt_scan','tax_prepayment',
];
