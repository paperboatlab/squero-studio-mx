// Julia highlighting for the MX editor. The legacy stream mode knows comments, strings,
// numbers and bare identifiers; this parser adds what a Julia reader scans for: macros,
// symbols, type annotations and names, standard calls, definitions, escapes and string
// interpolation. It is a CodeMirror stream parser, so long scripts stay cheap.
import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";

type JuliaState = {
  tokenize: (stream: StringStream, state: JuliaState) => string | null;
  scopes: string[];
  delimiter: string;
  last: string;
  definition: "" | "value" | "type";
  annotation: boolean;
  comments: number;
};

const KEYWORDS = new Set([
  "abstract", "baremodule", "begin", "break", "catch", "const", "continue", "do", "else",
  "elseif", "end", "export", "finally", "for", "function", "global", "if", "import", "in",
  "isa", "let", "local", "macro", "module", "mutable", "outer", "primitive", "public", "quote",
  "return", "struct", "try", "type", "typealias", "using", "where", "while",
]);

const OPENERS = new Set([
  "begin", "do", "for", "function", "if", "let", "macro", "module", "baremodule", "quote",
  "struct", "try", "while",
]);

const TYPE_KEYWORDS = new Set(["abstract", "mutable", "primitive", "struct", "type"]);

// Standard library names that read as calls rather than user variables. Types are capitalised
// and are classified by shape, so they do not need a list.
const STANDARD = new Set([
  "abs", "acos", "acosh", "all", "angle", "any", "append!", "argmax", "argmin", "asin",
  "asinh", "atan", "atanh", "axes", "broadcast", "cat", "cbrt", "ceil", "cis", "clamp",
  "close", "collect", "copy", "copyto!", "cos", "cosh", "count", "cross", "cumprod", "cumsum",
  "deepcopy", "delete!", "deleteat!", "det", "diag", "diagm", "diff", "display", "dot", "eachcol",
  "eachindex", "eachrow", "eigvals", "eigvecs", "enumerate", "eps", "eval", "exp", "expm1",
  "eye", "fill", "fill!", "filter", "findall", "findfirst", "findlast", "first", "floor",
  "flush", "foldl", "foldr", "get", "get!", "getindex", "haskey", "hcat", "hvcat", "hypot",
  "imag", "insert!", "inv", "isapprox", "isempty", "isequal", "isfinite", "isinf", "isnan",
  "keys", "last", "length", "linspace", "load", "log", "log10", "log1p", "log2", "lowercase",
  "lu", "map", "mapreduce", "maximum", "mean", "median", "merge", "meshgrid", "minimum", "mod",
  "ndims", "norm", "ones", "open", "parse", "permutedims", "plot", "pop!", "popfirst!", "print",
  "println", "prod", "push!", "pushfirst!", "qr", "rand", "randn", "range", "read", "real",
  "reduce", "rem", "repeat", "reshape", "round", "savefig", "setindex!", "show", "sign",
  "similar", "sin", "sinh", "size", "sort", "sortperm", "sqrt", "stack", "string", "strip",
  "subplot", "sum", "svd", "tan", "tanh", "transpose", "typemax", "typemin", "unique", "uppercase",
  "values", "vcat", "vec", "view", "writematrix", "write", "zeros", "zip",
]);

const CONSTANTS: Record<string, string> = {
  true: "bool",
  false: "bool",
  nothing: "null",
  missing: "null",
  NaN: "atom",
  Inf: "atom",
  pi: "atom",
  "π": "atom",
  "ℯ": "atom",
  im: "atom",
  stdout: "atom",
  stderr: "atom",
  stdin: "atom",
};

const IDENTIFIER = /^[_A-Za-z\u00A1-\uFFFF][\w\u00A1-\uFFFF]*!*/;
const MACRO = /^@[_A-Za-z\u00A1-\uFFFF][\w\u00A1-\uFFFF]*!*/;
const MACRO_OPERATOR = /^@\./;
const SYMBOL = /^:[_A-Za-z\u00A1-\uFFFF][\w\u00A1-\uFFFF]*!*/;
const SYMBOL_OPERATOR = /^:(?:[+\-*/\\^%<>=!&|~$?]|\u00d7|\u00f7)/;
const NUMBER = /^(?:0[xX][0-9a-fA-F_]+(?:\.[0-9a-fA-F_]*)?(?:[pP][+-]?[0-9_]+)?|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.(?!\.)\d[\d_]*(?:[eEfF][+-]?[\d_]+)?|\d[\d_]*\.(?!\.)\d[\d_]*(?:[eEfF][+-]?[\d_]+)?|\d[\d_]*(?:[eEfF][+-]?[\d_]+)?)(?:im\b)?/;
const OPERATOR = /^(?:===|!==|==|!=|<=|>=|<<=|>>=|>>>=|<<|>>>|>>|=>|->|-->>?|\.\.\.|\.\.|::|:=|\+=|-=|\*=|\/=|\^=|%=|&=|\|=|\$=|&&|\|\||[+\-*/\\^%<>=!&|~$?:]|\u00d7|\u00f7|\u2208|\u2209|\u220b|\u220c|\u2218|\u221a|\u221b|\u2229|\u222a|\u2260|\u2264|\u2265|\u2286|\u2288|\u228a|\u22c5)/;

const STRING_PREFIX = /^[_A-Za-z\u00A1-\uFFFF]\w*(?=""")/;
const STRING_PREFIX_ONE = /^[_A-Za-z\u00A1-\uFFFF]\w*(?=")/;

function stringTokenizer(stream: StringStream, state: JuliaState): string | null {
  const delimiter = state.delimiter;
  if (delimiter !== "`" && stream.match("$")) {
    // `$name` and `$(expr)` are interpolation: keep the mark, the body reads as source again
    // when it is on its own (the stream parser handles the common short forms here).
    stream.match(IDENTIFIER);
    stream.match("(");
    return "string.special";
  }
  if (stream.eat("\\")) {
    if (!stream.eol()) stream.next();
    return "escape";
  }
  if (stream.match(delimiter)) {
    state.tokenize = tokenBase;
    state.delimiter = '"';
    return "string";
  }
  if (delimiter === '"""' && stream.eat('"')) return "string";
  const stop = delimiter === "`" ? /[^\\$`]/ : /[^\\$"]/;
  stream.eatWhile(stop);
  if (stream.pos === stream.start && !stream.eol()) stream.next();
  return "string";
}

function startString(state: JuliaState, delimiter: string) {
  state.delimiter = delimiter;
  state.tokenize = stringTokenizer;
  return "string";
}

function tokenComment(stream: StringStream, state: JuliaState): string | null {
  if (stream.match("#=")) {
    state.comments++;
    return "comment";
  }
  if (stream.match("=#")) {
    state.comments--;
    if (state.comments <= 0) {
      state.comments = 0;
      state.tokenize = tokenBase;
    }
    return "comment";
  }
  if (!stream.match(/.*?(?=(#=|=#))/) || stream.pos === stream.start) stream.skipToEnd();
  return "comment";
}

function tokenBase(stream: StringStream, state: JuliaState): string | null {
  if (stream.match("#=")) {
    state.comments = 1;
    state.tokenize = tokenComment;
    return tokenComment(stream, state);
  }
  if (stream.match("#")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.eatSpace()) return null;

  if (stream.match('"""')) return startString(state, '"""');
  if (stream.match('"')) return startString(state, '"');
  if (stream.match("`")) return startString(state, "`");

  const prefix = STRING_PREFIX.exec(stream.string.slice(stream.pos));
  if (prefix) {
    stream.match(STRING_PREFIX);
    stream.match('"""');
    return startString(state, '"""');
  }
  const prefixOne = STRING_PREFIX_ONE.exec(stream.string.slice(stream.pos));
  if (prefixOne) {
    stream.match(STRING_PREFIX_ONE);
    stream.match('"');
    return startString(state, '"');
  }

  if (stream.match(MACRO) || stream.match(MACRO_OPERATOR)) return "macroName";
  if (stream.match(SYMBOL) || stream.match(SYMBOL_OPERATOR)) return "variableName.special";

  if (stream.match("::")) {
    state.annotation = true;
    return "operator";
  }

  if (stream.match(NUMBER)) return "number";

  if (stream.match(/^'(?:\\.|[^\\'])'/)) return "string";
  if (stream.eat("'")) return "operator";

  if (stream.match(OPERATOR)) return "operator";
  if (stream.match(/^[;,()[\]{}]/)) {
    const bracket = stream.current();
    if (bracket === "[" || bracket === "(") state.scopes.push(bracket);
    else if (bracket === "]" || bracket === ")") state.scopes.pop();
    return "punctuation";
  }
  if (stream.match(/^\./)) return "operator";

  if (stream.match(IDENTIFIER)) {
    const name = stream.current();
    if (KEYWORDS.has(name)) {
      if (name === "end") state.scopes.pop();
      else if (OPENERS.has(name)) state.scopes.push(name);
      if (name === "function" || name === "macro" || name === "const") state.definition = "value";
      else if (TYPE_KEYWORDS.has(name)) state.definition = "type";
      else if (name === "module" || name === "baremodule") state.definition = "type";
      return "keyword";
    }
    if (state.definition) {
      const kind = state.definition;
      state.definition = "";
      return kind === "type" ? "typeName.definition" : "variableName.definition";
    }
    if (state.annotation) {
      state.annotation = false;
      return "typeName";
    }
    if (state.last === ".") return "propertyName";
    const constant = CONSTANTS[name];
    if (constant) return constant;
    if (name.length > 1 && /^[A-Z]/.test(name)) return "typeName";
    if (STANDARD.has(name)) return "variableName.standard";
    return "variableName";
  }

  stream.next();
  return "invalid";
}

const juliaParser: StreamParser<JuliaState> = {
  name: "julia",
  startState: () => ({
    tokenize: tokenBase,
    scopes: [],
    delimiter: '"',
    last: "",
    definition: "",
    annotation: false,
    comments: 0,
  }),
  token(stream, state) {
    const style = state.tokenize(stream, state);
    const current = stream.current();
    if (current.trim()) state.last = current;
    return style;
  },
  indent(state, textAfter, context) {
    const delta = /^(end|else|elseif|catch|finally)\b/.test(textAfter) ? -1 : 0;
    return Math.max(0, (state.scopes.length + delta) * context.unit);
  },
  languageData: {
    commentTokens: { line: "#", block: { open: "#=", close: "=#" } },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*(end|else|elseif|catch|finally)\b$/,
    autocomplete: [...KEYWORDS],
  },
};

export const julia = StreamLanguage.define(juliaParser);
