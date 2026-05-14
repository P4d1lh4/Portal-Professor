-- =============================================================
-- 0002_rls_granular.sql
-- Substitui as policies temporárias por regras granulares por papel.
-- O service_role do backend continua bypass de RLS (Supabase padrão).
-- =============================================================

-- ---------------------------------------------------------------
-- Remove policies temporárias
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "temp_authenticated_all_profiles"    ON public.profiles;
DROP POLICY IF EXISTS "temp_authenticated_all_periods"     ON public.academic_periods;
DROP POLICY IF EXISTS "temp_authenticated_all_students"    ON public.students;
DROP POLICY IF EXISTS "temp_authenticated_all_modules"     ON public.modules;
DROP POLICY IF EXISTS "temp_authenticated_all_enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "temp_authenticated_all_grades"      ON public.grades;

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------

-- Qualquer usuário autenticado pode ver todos os perfis
-- (necessário para listar professores/coordenadores em selects)
CREATE POLICY "profiles_select_authenticated"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Usuário só atualiza o próprio perfil; admin pode atualizar qualquer um
CREATE POLICY "profiles_update_own_or_admin"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR is_admin())
    WITH CHECK (id = auth.uid() OR is_admin());

-- Somente admins inserem/deletam profiles (normalmente via trigger)
CREATE POLICY "profiles_insert_admin"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "profiles_delete_admin"
    ON public.profiles FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------
-- academic_periods
-- ---------------------------------------------------------------

-- Todos os autenticados podem ler períodos
CREATE POLICY "periods_select_authenticated"
    ON public.academic_periods FOR SELECT
    TO authenticated
    USING (true);

-- Somente admin cria/deleta períodos
CREATE POLICY "periods_insert_admin"
    ON public.academic_periods FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "periods_delete_admin"
    ON public.academic_periods FOR DELETE
    TO authenticated
    USING (is_admin());

-- Admin ou coordenador dono do período pode atualizar
CREATE POLICY "periods_update_admin_or_coordinator"
    ON public.academic_periods FOR UPDATE
    TO authenticated
    USING (is_admin() OR coordinator_id = auth.uid())
    WITH CHECK (is_admin() OR coordinator_id = auth.uid());

-- ---------------------------------------------------------------
-- students
-- ---------------------------------------------------------------

-- Admin e coordenador veem todos os alunos
-- Professor vê alunos matriculados nos seus módulos
CREATE POLICY "students_select"
    ON public.students FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.academic_periods ap
            WHERE ap.id = academic_period_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.student_id = students.id
              AND m.professor_id = auth.uid()
        )
    );

-- Admin e coordenador criam alunos; professor também (auto-enroll)
CREATE POLICY "students_insert"
    ON public.students FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.academic_periods ap
            WHERE ap.id = academic_period_id
              AND ap.coordinator_id = auth.uid()
        )
        OR current_user_role() = 'professor'
    );

-- Admin, coordenador e professor (com restrições no backend) podem atualizar
CREATE POLICY "students_update"
    ON public.students FOR UPDATE
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.academic_periods ap
            WHERE ap.id = academic_period_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.student_id = students.id
              AND m.professor_id = auth.uid()
        )
    );

-- Somente admin deleta alunos
CREATE POLICY "students_delete_admin"
    ON public.students FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------

-- Todos os autenticados veem módulos
CREATE POLICY "modules_select_authenticated"
    ON public.modules FOR SELECT
    TO authenticated
    USING (true);

-- Admin e coordenador criam módulos
CREATE POLICY "modules_insert"
    ON public.modules FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin()
        OR is_coordinator_of(academic_period_id)
        OR (current_user_role() = 'professor' AND professor_id = auth.uid())
    );

-- Admin e coordenador atualizam módulos
CREATE POLICY "modules_update"
    ON public.modules FOR UPDATE
    TO authenticated
    USING (
        is_admin()
        OR is_coordinator_of(academic_period_id)
    );

-- Admin e coordenador deletam módulos
CREATE POLICY "modules_delete"
    ON public.modules FOR DELETE
    TO authenticated
    USING (
        is_admin()
        OR is_coordinator_of(academic_period_id)
    );

-- ---------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------

CREATE POLICY "enrollments_select"
    ON public.enrollments FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR is_professor_of_module(module_id)
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.academic_periods ap ON ap.id = m.academic_period_id
            WHERE m.id = module_id
              AND ap.coordinator_id = auth.uid()
        )
    );

CREATE POLICY "enrollments_insert"
    ON public.enrollments FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin()
        OR is_professor_of_module(module_id)
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.academic_periods ap ON ap.id = m.academic_period_id
            WHERE m.id = module_id
              AND ap.coordinator_id = auth.uid()
        )
    );

CREATE POLICY "enrollments_update"
    ON public.enrollments FOR UPDATE
    TO authenticated
    USING (
        is_admin()
        OR is_professor_of_module(module_id)
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.academic_periods ap ON ap.id = m.academic_period_id
            WHERE m.id = module_id
              AND ap.coordinator_id = auth.uid()
        )
    );

CREATE POLICY "enrollments_delete_admin"
    ON public.enrollments FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------
-- grades
-- ---------------------------------------------------------------

CREATE POLICY "grades_select"
    ON public.grades FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.id = enrollment_id
              AND (
                  m.professor_id = auth.uid()
                  OR is_coordinator_of(m.academic_period_id)
              )
        )
    );

CREATE POLICY "grades_insert"
    ON public.grades FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.id = enrollment_id
              AND (
                  m.professor_id = auth.uid()
                  OR is_coordinator_of(m.academic_period_id)
              )
        )
    );

CREATE POLICY "grades_update"
    ON public.grades FOR UPDATE
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.id = enrollment_id
              AND (
                  m.professor_id = auth.uid()
                  OR is_coordinator_of(m.academic_period_id)
              )
        )
    );

CREATE POLICY "grades_delete_admin"
    ON public.grades FOR DELETE
    TO authenticated
    USING (is_admin());
