-- Reverting the Team Hub / Knowledge Quizzes feature at the user's request.
-- Both tables were empty (confirmed before dropping — no quizzes had been
-- created and no attempts taken), so this is a clean drop, not a data-loss
-- cleanup.
drop table if exists public.training_quiz_attempt;
drop table if exists public.training_quiz;

delete from public.page_permission where page_key = 'team-hub';
