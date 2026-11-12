// Julia's REPL lets `\pi` + Tab become π. The editor and the console share one map, so a
// symbol can never mean two things; the map is deliberately small and covers what a script
// actually reads: Greek letters, operators and common relations.
export const LATEX_SYMBOLS: Record<string, string> = {
  // Greek, lower case.
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ϵ",
  zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ",
  mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ",
  sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "ϕ", chi: "χ",
  psi: "ψ", omega: "ω",
  // Greek, upper case.
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε", Zeta: "Ζ", Eta: "Η",
  Theta: "Θ", Iota: "Ι", Kappa: "Κ", Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο",
  Pi: "Π", Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ", Phi: "Φ", Chi: "Χ", Psi: "Ψ",
  Omega: "Ω",
  // Arithmetic and sets.
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "⋅", ast: "∗", star: "⋆", circ: "∘",
  bullet: "∙", cap: "∩", cup: "∪", setminus: "∖", subset: "⊂", subseteq: "⊆",
  supset: "⊃", supseteq: "⊇", in: "∈", notin: "∉", ni: "∋", forall: "∀", exists: "∃",
  nexists: "∄", emptyset: "∅", varnothing: "∅", and: "∧", or: "∨", neg: "¬",
  // Relations and arrows.
  implies: "⇒", iff: "⇔", to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔",
  mapsto: "↦", uparrow: "↑", downarrow: "↓", approx: "≈", sim: "∼", simeq: "≃",
  cong: "≅", equiv: "≡", neq: "≠", ne: "≠", leq: "≤", le: "≤", geq: "≥", ge: "≥",
  ll: "≪", gg: "≫", propto: "∝",
  // Analysis and notation.
  partial: "∂", nabla: "∇", infty: "∞", sum: "∑", prod: "∏", int: "∫", oint: "∮",
  sqrt: "√", angle: "∠", degree: "°", prime: "′", ell: "ℓ", hbar: "ℏ", aleph: "ℵ",
  therefore: "∴", because: "∵", dots: "…", ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱",
};

export function latexSymbol(name: string): string | undefined {
  return LATEX_SYMBOLS[name];
}

/** Replace the `\name` immediately before the caret; null when there is nothing to do. */
export function replaceLatexAtCaret(value: string, caret: number): { value: string; caret: number } | null {
  const head = value.slice(0, caret);
  const match = /\\([A-Za-z]+)$/.exec(head);
  if (!match) return null;
  const symbol = LATEX_SYMBOLS[match[1]];
  if (!symbol) return null;
  return {
    value: `${value.slice(0, caret - match[0].length)}${symbol}${value.slice(caret)}`,
    caret: caret - match[0].length + symbol.length,
  };
}
