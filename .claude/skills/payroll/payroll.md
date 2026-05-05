# Skill: Finnish Payroll Calculations (2025)

Use this whenever building or fixing payroll features.

## Employee Deductions
| Contribution | Rate |
|---|---|
| TyEL Pension | 7.45% |
| TVR Unemployment | 0.79% |
| SV Health Insurance | 1.53% |
| Income Tax (ennakonpidätys) | Progressive or tax card override |

## Employer Contributions  
| Contribution | Rate |
|---|---|
| TyEL Pension | 17.34% |
| TVR Unemployment | 1.32% |
| SV Health Insurance | 1.53% |

## Progressive Income Tax Brackets (monthly, simplified 2025)
```
Annual 0–19,900:       0%
Annual 19,901–29,700:  12.64%
Annual 29,701–49,000:  19%
Annual 49,001–85,800:  21.75%
Annual 85,801–98,000:  21.75%
Annual 98,001+:        31.5%
```
Convert to monthly: calculate annual tax, divide by 12.

## Calculation Order
1. gross_salary (monthly input)
2. employee_pension = gross × 0.0745
3. employee_unemployment = gross × 0.0079
4. employee_health = gross × 0.0153
5. income_tax = tax_rate_override ? gross × (override/100) : progressiveTax(gross × 12) / 12
6. total_deductions = sum of 2–5
7. net_pay = gross − total_deductions
8. employer_cost = gross + (gross × 0.1734) + (gross × 0.0132) + (gross × 0.0153)

## Supabase Table: team_payroll
```sql
id uuid default gen_random_uuid() primary key,
name text not null,
role text,
gross_salary numeric not null,
hours_per_month numeric default 160,
tax_rate_override numeric,  -- nullable, percentage e.g. 25.0
created_at timestamptz default now()
```
