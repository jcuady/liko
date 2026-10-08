import { describe, expect, it } from 'vitest';

import { contentDisposition, csvCell, toCsv, withBom } from './csv';

describe('csvCell', () => {
  it('renders null and undefined as an empty cell', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('renders numbers without quoting', () => {
    expect(csvCell(0)).toBe('0');
    expect(csvCell(95)).toBe('95');
    expect(csvCell(-5)).toBe('-5');
  });

  it('quotes a cell containing a comma', () => {
    expect(csvCell('Ng, Ana')).toBe('"Ng, Ana"');
  });

  it('doubles an inner quote', () => {
    expect(csvCell('Ana "Annie" Ng')).toBe('"Ana ""Annie"" Ng"');
  });

  it('quotes a cell containing a line break', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('quotes a cell with leading or trailing whitespace', () => {
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  /*
   * The security-relevant cases. A student or guardian name is attacker
   * reachable, and a spreadsheet evaluates a leading '=' as a formula.
   */
  it('defuses a formula in a string cell', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3')).toBe("'-2+3");
  });

  it('guards a formula before quoting, so the guard survives either way', () => {
    // Both are dangerous; the apostrophe has to be inside the quotes.
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('=A1,B2')).toBe('"\'=A1,B2"');
  });

  it('does not defuse a number that happens to start with a minus', () => {
    expect(csvCell(-1)).toBe('-1');
    expect(csvCell(-0.5)).toBe('-0.5');
  });

  it('leaves an ordinary name alone', () => {
    expect(csvCell('Ana Ng')).toBe('Ana Ng');
    expect(csvCell('José María')).toBe('José María');
  });
});

describe('toCsv', () => {
  it('joins cells with commas and terminates rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
  });

  it('returns an empty string for no rows rather than a lone newline', () => {
    expect(toCsv([])).toBe('');
  });

  it('keeps a ragged row from shifting later columns', () => {
    const csv = toCsv([['Name', 'Mark'], ['Ng, Ana', 95]]);
    expect(csv).toBe('Name,Mark\r\n"Ng, Ana",95\r\n');
  });

  it('renders a missing mark as an empty cell, not the text null', () => {
    expect(toCsv([['Ana', null], ['Bo', 88]])).toBe('Ana,\r\nBo,88\r\n');
  });
});

describe('withBom', () => {
  it('prefixes U+FEFF so Excel reads UTF-8', () => {
    expect(withBom('a,b\r\n')).toBe('\uFEFFa,b\r\n');
  });
});

describe('contentDisposition', () => {
  it('keeps a normal filename', () => {
    expect(contentDisposition('Period 2.csv')).toBe('attachment; filename="Period-2.csv"');
  });

  it('strips characters that could terminate the header', () => {
    const header = contentDisposition('evil"\r\nx-injected: 1.csv');
    // The wrapping quotes are the header syntax; the filename inside them is
    // the untrusted part, and that is what must not carry a quote or a newline.
    const inner = /filename="([^"]*)"/.exec(header)?.[1] ?? '';
    expect(inner).toBe('evil-x-injected-1.csv');
    expect(inner).not.toMatch(/[\r\n"]/);
    expect(header).toBe('attachment; filename="evil-x-injected-1.csv"');
  });

  it('falls back rather than emitting an empty filename', () => {
    expect(contentDisposition('///')).toBe('attachment; filename="export.csv"');
  });

  it('caps the length', () => {
    const header = contentDisposition(`${'a'.repeat(300)}.csv`);
    expect(header.length).toBeLessThanOrEqual('attachment; filename=""'.length + 80);
  });
});