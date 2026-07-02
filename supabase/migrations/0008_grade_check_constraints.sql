-- =============================================================
-- 0008_grade_check_constraints.sql
-- Defesa em profundidade: garante no BANCO as faixas de nota/faltas
-- que hoje só são validadas na aplicação (Pydantic / clamp inline).
-- NUMERIC(4,2) aceita até 99.99, então sem CHECK o banco não barra
-- valores fora de faixa gravados por caminhos que burlem o validador
-- (SQL manual, futura RPC, correção direta).
--
-- Idempotente: DROP IF EXISTS antes de cada ADD.
-- Pré-condição: os dados existentes já devem estar em faixa (a app
-- sempre fez clamp). Se houver linha legada fora de faixa, o ADD falha
-- — nesse caso, corrija os dados antes de reaplicar.
-- =============================================================

-- ---------------------------------------------------------------
-- grades: notas em [0, 10], faltas >= 0
-- ---------------------------------------------------------------

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_tutor_grade_range;
ALTER TABLE public.grades ADD  CONSTRAINT grades_tutor_grade_range
    CHECK (tutor_grade BETWEEN 0 AND 10);

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_regular_exam_grade_range;
ALTER TABLE public.grades ADD  CONSTRAINT grades_regular_exam_grade_range
    CHECK (regular_exam_grade BETWEEN 0 AND 10);

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_makeup_exam_grade_range;
ALTER TABLE public.grades ADD  CONSTRAINT grades_makeup_exam_grade_range
    CHECK (makeup_exam_grade BETWEEN 0 AND 10);

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_final_grade_range;
ALTER TABLE public.grades ADD  CONSTRAINT grades_final_grade_range
    CHECK (final_grade BETWEEN 0 AND 10);

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_absences_non_negative;
ALTER TABLE public.grades ADD  CONSTRAINT grades_absences_non_negative
    CHECK (absences >= 0);

-- ---------------------------------------------------------------
-- modules: créditos > 0, limite de faltas >= 0
-- ---------------------------------------------------------------

ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_credits_positive;
ALTER TABLE public.modules ADD  CONSTRAINT modules_credits_positive
    CHECK (credits > 0);

ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_max_absences_non_negative;
ALTER TABLE public.modules ADD  CONSTRAINT modules_max_absences_non_negative
    CHECK (max_absences >= 0);

-- ---------------------------------------------------------------
-- Rollback (executar manualmente se necessário):
--   ALTER TABLE public.grades  DROP CONSTRAINT IF EXISTS grades_tutor_grade_range;
--   ALTER TABLE public.grades  DROP CONSTRAINT IF EXISTS grades_regular_exam_grade_range;
--   ALTER TABLE public.grades  DROP CONSTRAINT IF EXISTS grades_makeup_exam_grade_range;
--   ALTER TABLE public.grades  DROP CONSTRAINT IF EXISTS grades_final_grade_range;
--   ALTER TABLE public.grades  DROP CONSTRAINT IF EXISTS grades_absences_non_negative;
--   ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_credits_positive;
--   ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_max_absences_non_negative;
-- ---------------------------------------------------------------
