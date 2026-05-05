export interface AppCategory {
  id: string;
  label: string;
  icon: string;
  veroCategory: string;
}

export const INCOME_CATEGORIES: AppCategory[] = [
  { id: 'consulting_services', label: 'Consulting & Services', icon: 'briefcase',    veroCategory: 'Business Income' },
  { id: 'development',         label: 'Development',           icon: 'code',         veroCategory: 'Business Income' },
  { id: 'design',              label: 'Design',                icon: 'pen-tool',     veroCategory: 'Business Income' },
  { id: 'marketing',           label: 'Marketing',             icon: 'trending-up',  veroCategory: 'Business Income' },
  { id: 'sales_products',      label: 'Sales & Products',      icon: 'shopping-bag', veroCategory: 'Business Income' },
  { id: 'rental_income',       label: 'Rental Income',         icon: 'home',         veroCategory: 'Other operating income' },
  { id: 'grants_subsidies',    label: 'Grants & Subsidies',    icon: 'gift',         veroCategory: 'Subsidies and financial support' },
  { id: 'interest_income',     label: 'Interest Income',       icon: 'dollar-sign',  veroCategory: 'Interest income and other financial income' },
  { id: 'other_income',        label: 'Other Income',          icon: 'plus-circle',  veroCategory: 'Other taxable income' },
  { id: 'unclassified',        label: 'Unclassified',          icon: 'help-circle',  veroCategory: 'Unclassified' },
];

export const EXPENSE_CATEGORIES: AppCategory[] = [
  { id: 'fuel',              label: 'Fuel',                     icon: 'droplet',        veroCategory: 'Other deductible expenses' },
  { id: 'transport',         label: 'Transport',                icon: 'truck',          veroCategory: 'Other deductible expenses' },
  { id: 'materials',         label: 'Materials & Supplies',     icon: 'box',            veroCategory: 'Purchases and changes in inventory' },
  { id: 'equipment',         label: 'Equipment',                icon: 'tool',           veroCategory: 'Depreciation' },
  { id: 'external_services', label: 'External Services',        icon: 'users',          veroCategory: 'External services' },
  { id: 'staff_wages',       label: 'Staff & Wages',            icon: 'user-check',     veroCategory: 'Wage and staff expenses' },
  { id: 'rent_premises',     label: 'Rent & Premises',          icon: 'home',           veroCategory: 'Rent' },
  { id: 'subscriptions',     label: 'Subscriptions & Software', icon: 'repeat',         veroCategory: 'Other deductible expenses' },
  { id: 'entertainment',     label: 'Entertainment',            icon: 'coffee',         veroCategory: 'Entertainment expenses' },
  { id: 'interest_finance',  label: 'Interest & Finance',       icon: 'credit-card',    veroCategory: 'Interest expenses' },
  { id: 'other_deductible',  label: 'Other Deductible',         icon: 'more-horizontal',veroCategory: 'Other deductible expenses' },
  { id: 'unclassified',      label: 'Unclassified',             icon: 'help-circle',    veroCategory: 'Unclassified' },
];

const INCOME_KEYWORDS: Record<string, string[]> = {
  consulting_services: ['consult', 'advisory', 'coaching', 'training', 'workshop', 'mentoring'],
  development:         ['development', 'coding', 'programming', 'software', 'app', 'website', 'tech'],
  design:              ['design', 'graphic', 'ux', 'ui', 'logo', 'branding', 'illustration'],
  marketing:           ['marketing', 'advertising', 'seo', 'campaign', 'promotion', 'content creation'],
  sales_products:      ['sales', 'product', 'merchandise', 'goods', 'retail', 'inventory'],
  rental_income:       ['rental', 'rent', 'lease', 'property', 'airbnb'],
  grants_subsidies:    ['grant', 'subsidy', 'subsidies', 'funding', 'business finland', 'tuki'],
  interest_income:     ['interest', 'dividend', 'yield', 'investment return'],
  other_income:        [],
  unclassified:        [],
};

const EXPENSE_KEYWORDS: Record<string, string[]> = {
  fuel:              ['fuel', 'gas', 'petrol', 'diesel', 'shell', 'neste', 'circle k', 'benzine'],
  transport:         ['transport', 'taxi', 'uber', 'train', 'bus', 'flight', 'parking', 'vehicle', 'mileage'],
  materials:         ['materials', 'supplies', 'paper', 'packaging', 'raw material'],
  equipment:         ['equipment', 'hardware', 'laptop', 'computer', 'phone', 'machinery', 'device'],
  external_services: ['contractor', 'freelance', 'agency', 'outsource', 'service provider'],
  staff_wages:       ['salary', 'wages', 'payroll', 'staff', 'employee', 'personnel'],
  rent_premises:     ['rent', 'lease', 'office', 'premises', 'workspace'],
  subscriptions:     ['subscription', 'saas', 'license', 'microsoft', 'google workspace', 'adobe', 'cloud'],
  entertainment:     ['restaurant', 'dining', 'coffee', 'lunch', 'dinner', 'client meal', 'entertainment'],
  interest_finance:  ['interest', 'loan', 'bank fee', 'banking fee', 'credit fee'],
  other_deductible:  [],
  unclassified:      [],
};

export function detectCategory(description: string, type: 'income' | 'expense'): string | null {
  const lower = description.toLowerCase();
  const keywords = type === 'income' ? INCOME_KEYWORDS : EXPENSE_KEYWORDS;
  for (const [categoryId, words] of Object.entries(keywords)) {
    if (words.length > 0 && words.some(w => lower.includes(w))) return categoryId;
  }
  return null;
}
