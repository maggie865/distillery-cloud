import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

// Staff take the quiz already knowing who they are (this opens from a
// specific staff member's own Staff Training page, so there's no separate
// "who's taking this" picker needed). Scoring and sign-off both happen in
// one mutation so a pass can never be recorded without the matching
// training_signoff actually landing.
export default function TakeQuizDialog({ quiz, trainingItem, staffId, existingSignoff, open, onOpenChange }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState({}); // question_id -> option_id
  const [result, setResult] = useState(null);

  const questions = quiz?.questions || [];
  const allAnswered = questions.every((q) => answers[q.id]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const correctCount = questions.filter((q) => {
        const picked = answers[q.id];
        return q.options.find((o) => o.id === picked)?.correct;
      }).length;
      const scorePct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
      const passed = scorePct >= quiz.pass_threshold_pct;

      await db.TrainingQuizAttempt.create({
        quiz_id: quiz.id,
        staff_member_id: staffId,
        answers: questions.map((q) => ({ question_id: q.id, selected_option_id: answers[q.id] || null })),
        score_pct: scorePct,
        passed,
      });

      if (passed) {
        const payload = {
          staff_member_id: staffId,
          training_item_id: trainingItem.id,
          completed: true,
          date_completed: new Date().toISOString().split('T')[0],
          trainer: `Quiz pass (${scorePct}%)`,
        };
        if (existingSignoff) {
          await db.TrainingSignoff.update(existingSignoff.id, { ...payload, updated_at: new Date().toISOString() });
        } else {
          await db.TrainingSignoff.create(payload);
        }
      }

      return { scorePct, passed, correctCount, total: questions.length };
    },
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['trainingQuizAttemptsForStaff', staffId] });
      if (res.passed) {
        qc.invalidateQueries({ queryKey: ['trainingSignoffsForStaff', staffId] });
        toast.success(`Passed with ${res.scorePct}% — item signed off`);
      } else {
        toast.error(`Scored ${res.scorePct}% — needed ${quiz.pass_threshold_pct}% to pass`);
      }
    },
    onError: (e) => toast.error(e.message || 'Failed to submit quiz'),
  });

  const close = (v) => {
    if (!v) { setAnswers({}); setResult(null); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{quiz?.title}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-4 text-center space-y-3">
            {result.passed ? (
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
            ) : (
              <XCircle className="w-12 h-12 mx-auto text-destructive" />
            )}
            <p className="text-2xl font-bold font-display">{result.scorePct}%</p>
            <p className="text-sm text-muted-foreground">{result.correctCount} of {result.total} correct — {result.passed ? 'passed' : `needed ${quiz.pass_threshold_pct}% to pass`}</p>
            {result.passed && <p className="text-sm text-emerald-700 font-medium">"{trainingItem?.label}" has been signed off.</p>}
            <div className="flex gap-2 pt-2">
              {!result.passed && (
                <Button variant="outline" className="flex-1" onClick={() => { setAnswers({}); setResult(null); }}>
                  Try Again
                </Button>
              )}
              <Button className="flex-1" onClick={() => close(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {quiz?.description && <p className="text-sm text-muted-foreground">{quiz.description}</p>}
            {questions.map((q, qi) => (
              <div key={q.id} className="space-y-1.5">
                <Label className="text-sm font-medium">{qi + 1}. {q.text}</Label>
                <div className="space-y-1">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[q.id] === o.id}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                      />
                      {o.text}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button className="w-full" disabled={!allAnswered || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              {submitMutation.isPending ? 'Submitting…' : 'Submit Quiz'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
