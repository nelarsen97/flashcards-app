import { parseDashLines, parseSemicolonCsv } from '@/lib/csv';

describe('parseSemicolonCsv', () => {
  it('parses a simple front;back line', () => {
    expect(parseSemicolonCsv('hund;dog')).toEqual([{ front: 'hund', back: 'dog' }]);
  });

  it('splits on the FIRST semicolon, keeping later ones in the back', () => {
    expect(parseSemicolonCsv('a;b; c; d')).toEqual([{ front: 'a', back: 'b; c; d' }]);
  });

  it('trims surrounding whitespace on both sides', () => {
    expect(parseSemicolonCsv('  hund  ;  dog  ')).toEqual([{ front: 'hund', back: 'dog' }]);
  });

  it('handles CRLF, CR and LF line endings', () => {
    const text = 'a;1\r\nb;2\rc;3\nd;4';
    expect(parseSemicolonCsv(text)).toEqual([
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
      { front: 'c', back: '3' },
      { front: 'd', back: '4' },
    ]);
  });

  it('skips blank lines and surrounding whitespace-only lines', () => {
    expect(parseSemicolonCsv('a;1\n\n   \nb;2')).toEqual([
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
    ]);
  });

  it('skips lines with no separator', () => {
    expect(parseSemicolonCsv('not a card\na;1')).toEqual([{ front: 'a', back: '1' }]);
  });

  it('skips lines with an empty front', () => {
    expect(parseSemicolonCsv(';orphan back\na;1')).toEqual([{ front: 'a', back: '1' }]);
  });

  it('allows an empty back', () => {
    expect(parseSemicolonCsv('front;')).toEqual([{ front: 'front', back: '' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseSemicolonCsv('')).toEqual([]);
    expect(parseSemicolonCsv('\n\n  \n')).toEqual([]);
  });
});

describe('parseDashLines', () => {
  it('parses a simple front - back line', () => {
    expect(parseDashLines('anstendig - decent')).toEqual([{ front: 'anstendig', back: 'decent' }]);
  });

  it('parses the multi-line example into one card per line', () => {
    const text = 'anstendig - decent\nuventet - unexpected\nå sveise - to weld';
    expect(parseDashLines(text)).toEqual([
      { front: 'anstendig', back: 'decent' },
      { front: 'uventet', back: 'unexpected' },
      { front: 'å sveise', back: 'to weld' },
    ]);
  });

  it('splits on the FIRST dash, keeping later ones in the back', () => {
    expect(parseDashLines('a - well-known')).toEqual([{ front: 'a', back: 'well-known' }]);
  });

  it('trims spaces around the dash and at the line ends', () => {
    expect(parseDashLines('   å sveise   -   to weld   ')).toEqual([
      { front: 'å sveise', back: 'to weld' },
    ]);
  });

  it('handles CRLF, CR and LF line endings', () => {
    const text = 'a - 1\r\nb - 2\rc - 3\nd - 4';
    expect(parseDashLines(text)).toEqual([
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
      { front: 'c', back: '3' },
      { front: 'd', back: '4' },
    ]);
  });

  it('skips blank lines and surrounding whitespace-only lines', () => {
    expect(parseDashLines('a - 1\n\n   \nb - 2')).toEqual([
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
    ]);
  });

  it('skips lines with no separator', () => {
    expect(parseDashLines('not a card\na - 1')).toEqual([{ front: 'a', back: '1' }]);
  });

  it('skips lines with an empty front or back', () => {
    expect(parseDashLines('- orphan back\na - 1\nlonely -')).toEqual([{ front: 'a', back: '1' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseDashLines('')).toEqual([]);
    expect(parseDashLines('\n\n  \n')).toEqual([]);
  });
});
