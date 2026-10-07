import { describe, expect, it } from 'vitest';

import {
  attendanceStatusSchema,
  classSchema,
  heatCellSchema,
  roleSchema,
  statSchema,
  studentSchema,
} from './types';

/**
 * The fixture-backed adapter must satisfy the same contracts a real API would,
 * otherwise swapping the adapter would break every screen at once. These tests
 * assert the contracts hold against real sample data.
 */
describe('domain contracts', () => {
  it('accepts every fixture student', async () => {
    const { students } = await import('@/lib/fixtures/workspace');
    for (const student of students) {
      expect(studentSchema.safeParse(student).success).toBe(true);
    }
  });

  it('accepts every fixture class', async () => {
    const { classes } = await import('@/lib/fixtures/workspace');
    for (const item of classes) {
      expect(classSchema.safeParse(item).success).toBe(true);
    }
  });

  it('accepts every fixture stat and heat cell', async () => {
    const { stats, heatmap } = await import('@/lib/fixtures/workspace');
    for (const stat of stats) expect(statSchema.safeParse(stat).success).toBe(true);
    for (const cell of heatmap) expect(heatCellSchema.safeParse(cell).success).toBe(true);
  });

  it('rejects a grade outside the valid range', () => {
    const base = {
      id: 'stu_001',
      name: 'Ana Ferreira',
      initials: 'AF',
      attendanceRate: 98,
      trend: 'up' as const,
    };
    expect(studentSchema.safeParse({ ...base, grade: 101 }).success).toBe(false);
    expect(studentSchema.safeParse({ ...base, grade: -1 }).success).toBe(false);
    expect(studentSchema.safeParse({ ...base, grade: 94 }).success).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(roleSchema.safeParse('teacher').success).toBe(false);
    expect(roleSchema.safeParse('instructor').success).toBe(true);
  });

  it('rejects an unknown attendance status', () => {
    expect(attendanceStatusSchema.safeParse('maybe').success).toBe(false);
    expect(attendanceStatusSchema.safeParse('excused').success).toBe(true);
  });

  it('keeps fixtures internally consistent', async () => {
    const { classes, students, heatmap } = await import('@/lib/fixtures/workspace');

    // Every heat cell must reference a student that exists, otherwise the
    // heatmap would render a row with no name.
    const ids = new Set(students.map((student) => student.id));
    for (const cell of heatmap) {
      expect(ids.has(cell.studentId)).toBe(true);
    }

    // Declared class sizes must be plausible against the sample roster.
    for (const item of classes) {
      expect(item.studentCount).toBeGreaterThanOrEqual(students.length);
    }
  });
});