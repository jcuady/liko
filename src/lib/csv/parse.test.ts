import { describe, expect, it } from 'vitest';

import { parseCsv } from './parse';

describe('parseCsv', () => {
  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('reads a simple table', () => {
    expect(parseCsv('name,code\nChemistry,CHEM-2\nBiology,BIO-1\n')).toEqual([
      ['name', 'code'],
      ['Chemistry', 'CHEM-2'],
      ['Biology', 'BIO-1'],
    ]);
  });

  it('drops the byte order mark Excel writes', () => {
    expect(parseCsv('\uFEFFname,code\nAna,1\n')[0]).toEqual(['name', 'code']);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles a quoted field containing the delimiter', () => {
    expect(parseCsv('name,note\n"Ng, Ana",present\n')).toEqual([
      ['name', 'note'],
      ['Ng, Ana', 'present'],
    ]);
  });

  it('handles a quoted field containing a line break', () => {
    expect(parseCsv('name,note\n"Ana","line one\nline two"\n')).toEqual([
      ['name', 'note'],
      ['Ana', 'line one\nline two'],
    ]);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsv('name\n"Ana ""Annie"" Ng"\n')).toEqual([['name'], ['Ana "Annie" Ng']]);
  });

  it('does not treat a bare apostrophe as a quote', () => {
    expect(parseCsv("name\nO'Neill\n")).toEqual([['name'], ["O'Neill"]]);
  });

  it('does not add a final empty row for a trailing newline', () => {
    expect(parseCsv('a\nb\n')).toEqual([['a'], ['b']]);
  });

  it('keeps the final row when there is no trailing newline', () => {
    expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
  });

  it('keeps a formula-looking cell as text', () => {
    // The writer defuses these on the way out; a file from elsewhere may not
    // have, and the preview has to show the teacher what is really there.
    expect(parseCsv('name\n=1+1\n')).toEqual([['name'], ['=1+1']]);
  });

  it('preserves a row with fewer cells than the header', () => {
    expect(parseCsv('a,b,c\n1,2\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2'],
    ]);
  });

  it('preserves a row with more cells than the header', () => {
    expect(parseCsv('a,b\n1,2,3\n')).toEqual([
      ['a', 'b'],
      ['1', '2', '3'],
    ]);
  });

  it('round-trips the writer output', async () => {
    const { toCsv } = await import('../export/csv');
    const rows = [
      ['Student', 'Mark'],
      ['Ng, Ana', 95],
      ['Ana "Annie" Ng', 88],
    ];

    expect(parseCsv(toCsv(rows))).toEqual(rows.map((row) => row.map(String)));
  });
});