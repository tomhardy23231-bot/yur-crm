-- ============================================================================
-- 0002_baseline_data.sql — данные, которые в мире Supabase сеялись миграциями
-- (schema-only слепок 0001 их не содержит): departments (10), payroll_rates
-- (7/10/25), org_requisites (ОЛІМП). Идемпотентно (ON CONFLICT DO NOTHING).
--
-- ⚠ Сессия 7 (прод-переезд): перенос прод-данных идёт в ПУСТЫЕ таблицы —
-- эти три таблицы перед COPY чистятся (TRUNCATE ... CASCADE): id строк здесь
-- сгенерены заново и НЕ совпадают с прод-id (unique(name) дал бы конфликт).
-- ============================================================================


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.departments VALUES ('fb2bc9c3-187b-49a8-b6d2-a1253bc604ab', 'Київський', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('1a633718-6786-4652-8641-3d99311defd4', 'Дніпровський', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('328a61db-a54a-406e-96dd-f75d485596f8', 'Львівський', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('d262f391-59c2-4795-ad4b-ece16451ef3a', 'Одеський', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('bb2fbf72-54e2-4268-8d3a-80d80cebcc78', 'Підрозділ 5', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('f69ad6b8-0678-4a07-89a7-c20935969202', 'Підрозділ 6', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('c7fe76b5-edd2-4692-b8b7-9cf52609521c', 'Підрозділ 7', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('83f29d94-24f2-4c7d-995e-69deedbccd10', 'Підрозділ 8', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('f9881024-797d-4218-991b-f3231b9ae8db', 'Підрозділ 9', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;
INSERT INTO public.departments VALUES ('d5a4adb6-4da1-4329-94a4-c14f13dc35a1', 'Підрозділ 10', true, '2026-07-14 19:43:16.781717+00') ON CONFLICT DO NOTHING;


--
-- Data for Name: org_requisites; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.org_requisites VALUES (1, 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ЦЕНТР ЮРИДИЧНОГО ЗАХИСТУ "ОЛІМП"', '45679789', '49038, Дніпропетровська обл., місто Дніпро, пр.Яворницького Дмитра, будинок 111 А', '+380996667366', 'UA053220010000026003700003989', 'АТ "УНІВЕРСАЛ БАНК"', '322001', '{"Не є платником ПДВ","Є платником єдиного податку, 3 група"}', '2026-07-14 19:43:16.870472+00', NULL) ON CONFLICT DO NOTHING;


--
-- Data for Name: payroll_rates; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.payroll_rates VALUES ('document', '2026-07-14 19:43:16.427624+00', 7.00, 7.00) ON CONFLICT DO NOTHING;
INSERT INTO public.payroll_rates VALUES ('claim', '2026-07-14 19:43:16.427624+00', 10.00, 10.00) ON CONFLICT DO NOTHING;
INSERT INTO public.payroll_rates VALUES ('representation', '2026-07-14 19:43:16.427624+00', 25.00, 25.00) ON CONFLICT DO NOTHING;


--
-- PostgreSQL database dump complete
--


