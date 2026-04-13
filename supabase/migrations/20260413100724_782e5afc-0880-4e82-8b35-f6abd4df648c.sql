-- Create a default company and assign it to the user without a company
INSERT INTO public.companies (id, name, description) 
VALUES ('a0000000-0000-0000-0000-000000000001', 'Компания (по умолчанию)', 'Автоматически созданная компания')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles 
SET company_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE user_id = '82c3428f-edad-412e-8f44-40070830ecfd' AND company_id IS NULL;