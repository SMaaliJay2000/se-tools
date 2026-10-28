/**
 * Splits a SQL script into statements without parsing it, so one bad statement doesn't hide the rest.
 * Understands '..' ".." `..` strings, [..] identifiers (SQL Server), -- and /* comments, # comments (MySQL),
 * PostgreSQL $tag$..$tag$ bodies and SQL Server `GO` batch separators.
 * Returns [{ text, line }] where `line` is the 1-based line of the statement's first token; comment-only chunks are dropped.
 */
export function splitStatements(sql, dialect) {
  const out = [];
  const n = sql.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let codeStart = -1;
  let codeLine = 1;

  const mark = () => {
    if (codeStart < 0) {
      codeStart = i;
      codeLine = line;
    }
  };
  const flush = (end) => {
    if (codeStart >= 0) {
      const text = sql.slice(codeStart, end).trim();
      if (text) out.push({ text, line: codeLine });
    }
    codeStart = -1;
  };
  const newline = () => {
    line++;
    lineStart = i + 1;
  };
  const skipToEol = () => {
    while (i < n && sql[i] !== "\n") i++;
  };

  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];

    if (c === "\n") {
      newline();
      i++;
    } else if ((c === "-" && d === "-") || (c === "#" && dialect === "mysql")) {
      skipToEol();
    } else if (c === "/" && d === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      for (; i < stop; i++) if (sql[i] === "\n") newline();
    } else if (c === "'" || c === '"' || c === "`" || (c === "[" && dialect === "sqlserver")) {
      mark();
      const close = c === "[" ? "]" : c;
      i++;
      while (i < n) {
        const ch = sql[i];
        if (ch === "\n") newline();
        if (ch === "\\" && dialect === "mysql" && close !== "]") {
          i += 2;
          continue;
        }
        if (ch === close) {
          if (sql[i + 1] === close && close !== "]") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
    } else if (c === "$" && dialect === "postgresql" && /^\$(?:[A-Za-z_]\w*)?\$/.test(sql.slice(i, i + 64))) {
      mark();
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64))[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end < 0 ? n : end + tag.length;
      for (; i < stop; i++) if (sql[i] === "\n") newline();
    } else if (c === ";") {
      flush(i);
      i++;
    } else if (dialect === "sqlserver" && (c === "G" || c === "g") && /^\s*$/.test(sql.slice(lineStart, i)) && /^go(?:\s+\d+)?[ \t]*(?:--[^\n]*)?(?:\r?\n|$)/i.test(sql.slice(i, i + 80))) {
      flush(i);
      skipToEol();
    } else {
      if (!/\s/.test(c)) mark();
      i++;
    }
  }
  flush(n);
  return out;
}

/** The statement with comments and the contents of string literals blanked out; keeps keywords for lexical fallback checks. */
export function stripLiteralsAndComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^'\\]|''|\\.)*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}
