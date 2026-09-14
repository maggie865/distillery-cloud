import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const uid = () => Math.random().toString(36).slice(2, 10);

const blankQuestion = () => ({ id: uid(), text: '', options: [{ id: uid(), text: '', correct: true }, { id: uid(), text: '', correct: false }] });

// Create/edit the single quiz attached to a training item — one quiz per
// item (enforced by a unique constraint on training_item_id), so this is
// always either "add a quiz" or "edit the quiz", never a list to pick from.
export default function QuizEditorDialog({ trainingItem, existingQuiz, open, onOpenChange }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(existingQuiz?.title || `${trainingItem?.label || ''} Quiz`);
  const [description, setDescription] = useState(existingQuiz?.description || '');
  const [passThreshold, setPassThreshold] = useState(existingQuiz?.pass_threshold_pct ?? 80);
  const [questions, setQuestions] = useState(existingQuiz?.questions?.length ? existingQuiz.questions : [blankQuestion()]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addQuestion = () => setQuestions((q) => [...q, blankQuestion()]);
  const removeQuestion = (qid) => setQuestions((q) => q.filter((x) => x.id !== qid));
  const setQuestionText = (qid, text) => setQuestions((q) => q.map((x) => (x.id === qid ? { ...x, text } : x)));
  const addOption = (qid) => setQuestions((q) => q.map((x) => (x.id === qid ? { ...x, options: [...x.options, { id: uid(), text: '', correct: false }] } : x)));
  const removeOption = (qid, oid) => setQuestions((q) => q.map((x) => (x.id === qid ? { ...x, options: x.options.filter((o) => o.id !== oid) } : x)));
  const setOptionText = (qid, oid, text) => setQuestions((q) => q.map((x) => (x.id === qid ? { ...x, options: x.options.map((o) => (o.id === oid ? { ...o, text } : o)) } : x)));
  const setCorrect = (qid, oid) => setQuestions((q) => q.map((x) => (x.id === qid ? { ...x, options: x.options.map((o) => ({ ...o, correct: o.id === oid })) } : x)));

  const validQuestions = questions.filter((q) => q.text.trim() && q.options.filter((o) => o.text.trim()).length >= 2 && q.options.some((o) => o.correct));
  const canSave = validQuestions.length > 0 && title.trim();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        training_item_id: trainingItem.id,
        title: title.trim(),
        description: description.trim() || undefined,
        pass_threshold_pct: Math.max(1, Math.min(100, parseInt(passThreshold) || 80)),
        questions: validQuestions.map((q) => ({
          id: q.id,
          text: q.text.trim(),
          options: q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim(), correct: !!o.correct })),
        })),
      };
      if (existingQuiz) {
        await db.TrainingQuiz.update(existingQuiz.id, payload);
      } else {
        await db.TrainingQuiz.create(payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainingQuizzes'] });
      toast.success('Quiz saved');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to save quiz'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.TrainingQuiz.delete(existingQuiz.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainingQuizzes'] });
      toast.success('Quiz deleted');
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to delete quiz'),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{existingQuiz ? 'Edit Quiz' : 'Add Quiz'} — {trainingItem?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs">Quiz title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this quiz checks understanding of…" />
            </div>
            <div className="max-w-[160px]">
              <Label className="text-xs">Pass threshold (%)</Label>
              <Input type="number" min="1" max="100" value={passThreshold} onChange={(e) => setPassThreshold(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Scoring at or above this signs the item off automatically.</p>
            </div>

            <div className="space-y-3">
              <Label className="text-xs">Questions</Label>
              {questions.map((q, qi) => (
                <div key={q.id} className="rounded-lg border border-border p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-muted-foreground mt-2.5">{qi + 1}.</span>
                    <Textarea rows={1} value={q.text} onChange={(e) => setQuestionText(q.id, e.target.value)} placeholder="Question text" className="flex-1" />
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeQuestion(q.id)} disabled={questions.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="pl-6 space-y-1.5">
                    {q.options.map((o) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input type="radio" name={`correct-${q.id}`} checked={o.correct} onChange={() => setCorrect(q.id, o.id)} className="shrink-0" title="Correct answer" />
                        <Input value={o.text} onChange={(e) => setOptionText(q.id, o.id, e.target.value)} placeholder="Answer option" className="h-8 text-sm" />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => removeOption(q.id, o.id)} disabled={q.options.length <= 2}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addOption(q.id)}>
                      <Plus className="w-3 h-3" /> Add option
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addQuestion}>
                <Plus className="w-3.5 h-3.5" /> Add Question
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              {existingQuiz && (
                <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  Delete Quiz
                </Button>
              )}
              <Button type="button" className="flex-1" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving…' : 'Save Quiz'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quiz?</AlertDialogTitle>
            <AlertDialogDescription>Past attempt history stays on record, but staff will no longer be able to take this quiz for "{trainingItem?.label}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
