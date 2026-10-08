import type { ReactNode } from 'react';

import type { FlowStage } from '@/lib/api/types';

export interface StageDefinition {
  id: FlowStage;
  /** Short verb shown as the step label. */
  label: string;
  title: string;
  /** What this stage stops you doing twice. Concrete, never vague. */
  cost: string;
  capability: string;
  /** Real artifact shape rendered inside the card. */
  artifact: 'standards' | 'questions' | 'marks' | 'grade' | 'trend';
}

export const STAGES: StageDefinition[] = [
  {
    id: 'plan',
    label: 'Plan',
    title: 'Write the unit once.',
    cost: 'Most teachers write the same unit plan four times, once per class section.',
    capability: 'One plan, four sections, zero retyping.',
    artifact: 'standards',
  },
  {
    id: 'create',
    label: 'Create',
    title: 'Build questions from the plan.',
    cost: 'Questions get retyped from the plan into whatever tool runs them.',
    capability: 'Question types that inherit the plan context.',
    artifact: 'questions',
  },
  {
    id: 'assess',
    label: 'Assess',
    title: 'Weight the marks the way you actually grade.',
    cost: 'The weighting lives in a spreadsheet, so every class is recalculated by hand.',
    capability: 'Assessments carry their own weight, and the gradebook does the rest.',
    artifact: 'marks',
  },
  {
    id: 'grade',
    label: 'Grade',
    title: 'Keep the audit trail.',
    cost: 'A spreadsheet gives you a mark, not a reason you can stand behind.',
    capability: 'Every mark remembers how it was earned.',
    artifact: 'grade',
  },
  {
    id: 'analyze',
    label: 'Analyze',
    title: 'See the drop-off in week six, not week fourteen.',
    cost: 'You find out a student is struggling once the report card is already written.',
    capability: 'At-risk flags that surface while there is still time.',
    artifact: 'trend',
  },
];

export type StageChildren = ReactNode;