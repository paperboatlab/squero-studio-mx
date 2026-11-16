/** Find offsets of `%` characters that look like MATLAB comments (outside Julia strings and `#` comments). */
export function findMatlabPercentComments(source: string): number[] {
  const hits: number[] = [];
  let i = 0;
  let blockCommentDepth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (blockCommentDepth > 0) {
      if (ch === "#" && source[i + 1] === "=") {
        blockCommentDepth++;
        i += 2;
      } else if (ch === "=" && source[i + 1] === "#") {
        blockCommentDepth--;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (ch === "#" && source[i + 1] === "=") {
      blockCommentDepth = 1;
      i += 2;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "`") {
      const triple = source[i + 1] === ch && source[i + 2] === ch;
      i += triple ? 3 : 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (triple) {
          if (source[i] === ch && source[i + 1] === ch && source[i + 2] === ch) {
            i += 3;
            break;
          }
          i++;
        } else {
          if (source[i] === ch || (ch === '"' && source[i] === "\n")) {
            i++;
            break;
          }
          i++;
        }
      }
      continue;
    }
    if (ch === "'") {
      const prev = i > 0 ? source[i - 1] : "";
      const isTranspose = /[A-Za-z0-9_!\])}'\u0080-\uffff]/.test(prev);
      if (!isTranspose) {
        const match = /^'(?:[^'\\\r\n]|\\(?:.|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}))'/.exec(source.slice(i));
        if (match) {
          i += match[0].length;
          continue;
        }
      }
      i++;
      continue;
    }
    if (ch === "%") {
      hits.push(i);
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    i++;
  }
  return hits;
}
