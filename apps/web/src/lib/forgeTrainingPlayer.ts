import type { CoursePlayerData } from '@/components/training/CoursePlayer'
import type { LearnerView } from '@/lib/forgeTrainingLms'

/** Shapes the learner view into the course player's props (no correct answers, no storage paths). */
export const toCoursePlayerData = (view: LearnerView): CoursePlayerData => ({
  courseTitle: view.course?.title || 'Training',
  courseDescription: view.course?.description || null,
  status: view.assignment.status,
  dueDate: view.assignment.due_date,
  published: Boolean(view.version),
  passingPercent: view.version?.passing_percent ?? null,
  requiresAcknowledgement: Boolean(view.version?.requires_acknowledgement),
  acknowledgementText: view.version?.acknowledgement_text || null,
  sections: view.sections.map((section: any) => ({
    id: section.id,
    title: section.title,
    body: section.body,
    materialId: section.material_id,
    isRequired: section.is_required,
    estimatedMinutes: section.estimated_minutes
  })),
  materials: Object.fromEntries(view.materials.map((item: any) => [item.id, { title: item.title, contentType: item.content_type }])),
  completedSections: view.completedSections,
  contentDone: view.contentDone,
  hasQuiz: view.hasQuiz,
  attemptsRemaining: view.attemptsRemaining,
  quiz: view.quiz,
  review: view.review
})
