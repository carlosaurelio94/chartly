-- Costo real del vehículo, reserva de impuestos y presupuestos por categoría.
alter table public.user_settings add column if not exists gig_cost_per_km numeric check (gig_cost_per_km >= 0 and gig_cost_per_km < 100000);
alter table public.user_settings add column if not exists tax_reserve_pct numeric check (tax_reserve_pct >= 0 and tax_reserve_pct <= 60);
alter table public.bill_categories add column if not exists monthly_budget numeric check (monthly_budget > 0);

comment on column public.user_settings.gig_cost_per_km is 'Costo del vehículo por km (desgaste, service, cubiertas, amortización) en gig_default_currency. No incluye nafta, que se carga aparte.';
comment on column public.user_settings.tax_reserve_pct is 'Porcentaje de cada cobro de jornada que se aparta para impuestos (monotributo, etc.).';
comment on column public.bill_categories.monthly_budget is 'Tope de gasto mensual de la categoría, en la moneda por defecto del usuario.';
