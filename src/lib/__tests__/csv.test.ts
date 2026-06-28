import { parseDelimited } from '@/lib/csv';

describe('parseDelimited', () => {
  it('parses a simple front<sep>back line', () => {
    expect(parseDelimited('hund;dog', ';')).toEqual([{ front: 'hund', back: 'dog' }]);
    expect(parseDelimited('anstendig - decent', '-')).toEqual([
      { front: 'anstendig', back: 'decent' },
    ]);
  });

  it('parses a multi-line dash list into one card per line', () => {
    const text = 'anstendig - decent\nuventet - unexpected\nå sveise - to weld';
    expect(parseDelimited(text, '-')).toEqual([
      { front: 'anstendig', back: 'decent' },
      { front: 'uventet', back: 'unexpected' },
      { front: 'å sveise', back: 'to weld' },
    ]);
  });

  it('splits on the FIRST separator, keeping later ones in the back', () => {
    expect(parseDelimited('a;b; c; d', ';')).toEqual([{ front: 'a', back: 'b; c; d' }]);
    expect(parseDelimited('a - well-known', '-')).toEqual([{ front: 'a', back: 'well-known' }]);
  });

  it('trims spaces around the separator and at the line ends', () => {
    expect(parseDelimited('  hund  ;  dog  ', ';')).toEqual([{ front: 'hund', back: 'dog' }]);
    expect(parseDelimited('   å sveise   -   to weld   ', '-')).toEqual([
      { front: 'å sveise', back: 'to weld' },
    ]);
  });

  it('supports a multi-character separator', () => {
    expect(parseDelimited('a -> b -> c', '->')).toEqual([{ front: 'a', back: 'b -> c' }]);
  });

  it('handles CRLF, CR and LF line endings', () => {
    const text = 'a;1\r\nb;2\rc;3\nd;4';
    expect(parseDelimited(text, ';')).toEqual([
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
      { front: 'c', back: '3' },
      { front: 'd', back: '4' },
    ]);
  });

  it('skips blank lines and surrounding whitespace-only lines', () => {
    expect(parseDelimited('a;1\n\n   \nb;2', ';')).toEqual([
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
    ]);
  });

  it('skips lines with no separator', () => {
    expect(parseDelimited('not a card\na;1', ';')).toEqual([{ front: 'a', back: '1' }]);
  });

  it('skips lines with an empty front', () => {
    expect(parseDelimited(';orphan back\na;1', ';')).toEqual([{ front: 'a', back: '1' }]);
  });

  it('allows an empty back', () => {
    expect(parseDelimited('front;', ';')).toEqual([{ front: 'front', back: '' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseDelimited('', ';')).toEqual([]);
    expect(parseDelimited('\n\n  \n', ';')).toEqual([]);
  });

  it('returns no rows when the separator is empty', () => {
    expect(parseDelimited('a;b\nc;d', '')).toEqual([]);
  });
});
