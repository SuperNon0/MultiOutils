/**
 * Calculatrice SÛRE (aucun eval) : analyseur à descente récursive.
 *
 * Grammaire :
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%' ) unary | implicite)*
 *   unary   := ('+' | '-') unary | power
 *   power   := postfix ('^' unary)?          (associatif à droite)
 *   postfix := primary ('%' | '!')*          (% en fin = pourcentage)
 *   primary := nombre | constante | fonction '(' expr ')' | '(' expr ')'
 *
 * Nombres : virgule ou point décimal (« 3,5 » = « 3.5 »), notation 1e3.
 * Symboles tolérés : × · ÷ − ** et « x » entre deux nombres.
 */

export class CalcError extends Error {}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: '(' }
  | { t: ')' };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  racine: Math.sqrt,
  cbrt: Math.cbrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  exp: Math.exp,
  abs: Math.abs,
  round: Math.round,
  arrondi: Math.round,
  floor: Math.floor,
  ceil: Math.ceil
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  'π': Math.PI,
  e: Math.E,
  tau: Math.PI * 2
};

function tokenize(input: string): { tokens: Tok[]; decimalComma: boolean } {
  const tokens: Tok[] = [];
  let decimalComma = false;
  let i = 0;
  const s = input
    .replace(/\*\*/g, '^')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === ' ' || c === ' ') {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || ((c === '.' || c === ',') && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      let txt = '';
      let sawSep = false;
      while (j < s.length) {
        const d = s[j];
        if (/[0-9]/.test(d)) txt += d;
        else if ((d === '.' || d === ',') && !sawSep && /[0-9]/.test(s[j + 1] ?? '')) {
          sawSep = true;
          if (d === ',') decimalComma = true;
          txt += '.';
        } else break;
        j++;
      }
      // exposant scientifique : 1e3, 2.5E-4
      if ((s[j] === 'e' || s[j] === 'E') && /[0-9]/.test(s[j + 1] ?? '')) {
        let k = j + 1;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        txt += s.slice(j, k);
        j = k;
      } else if ((s[j] === 'e' || s[j] === 'E') && /[+-]/.test(s[j + 1] ?? '') && /[0-9]/.test(s[j + 2] ?? '')) {
        let k = j + 2;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        txt += s.slice(j, k);
        j = k;
      }
      tokens.push({ t: 'num', v: Number(txt) });
      i = j;
      continue;
    }
    if (/[a-zA-Zπ]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9π]/.test(s[j])) j++;
      const word = s.slice(i, j).toLowerCase();
      // « 3 x 4 » : x entre deux opérandes = multiplication
      if (word === 'x') tokens.push({ t: 'op', v: '*' });
      else tokens.push({ t: 'id', v: word });
      i = j;
      continue;
    }
    if ('+-*/^%!'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(' || c === '[') {
      tokens.push({ t: '(' });
      i++;
      continue;
    }
    if (c === ')' || c === ']') {
      tokens.push({ t: ')' });
      i++;
      continue;
    }
    throw new CalcError(`caractère inattendu « ${c} »`);
  }
  return { tokens, decimalComma };
}

class Parser {
  private pos = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private isOp(v: string, tok = this.peek()): boolean {
    return tok?.t === 'op' && tok.v === v;
  }
  /** Le jeton peut commencer un opérande (pour la multiplication implicite). */
  private startsOperand(tok = this.peek()): boolean {
    return tok?.t === 'num' || tok?.t === 'id' || tok?.t === '(';
  }

  parse(): number {
    const v = this.expr();
    if (this.pos < this.toks.length) throw new CalcError('expression incomplète');
    return v;
  }

  private expr(): number {
    let v = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.pos++] as { v: string }).v;
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  private term(): number {
    let v = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.toks[this.pos++] as { v: string }).v;
        const r = this.unary();
        if (op === '/' && r === 0) throw new CalcError('division par zéro');
        v = op === '*' ? v * r : v / r;
      } else if (this.isOp('%') && this.startsOperand(this.toks[this.pos + 1])) {
        this.pos++;
        const r = this.unary();
        if (r === 0) throw new CalcError('division par zéro');
        v = v % r;
      } else if (this.startsOperand()) {
        // multiplication implicite : 2pi, 3(4+1), (1+1)(2)
        v = v * this.unary();
      } else break;
    }
    return v;
  }

  private unary(): number {
    if (this.isOp('-')) {
      this.pos++;
      return -this.unary();
    }
    if (this.isOp('+')) {
      this.pos++;
      return this.unary();
    }
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    if (this.isOp('^')) {
      this.pos++;
      const exp = this.unary();
      return Math.pow(base, exp);
    }
    return base;
  }

  private postfix(): number {
    let v = this.primary();
    for (;;) {
      if (this.isOp('%') && !this.startsOperand(this.toks[this.pos + 1])) {
        this.pos++;
        v = v / 100;
      } else if (this.isOp('!')) {
        this.pos++;
        v = factorial(v);
      } else break;
    }
    return v;
  }

  private primary(): number {
    const tok = this.toks[this.pos];
    if (!tok) throw new CalcError('expression incomplète');
    if (tok.t === 'num') {
      this.pos++;
      return tok.v;
    }
    if (tok.t === '(') {
      this.pos++;
      const v = this.expr();
      // parenthèse fermante facultative en fin d'expression (« sqrt(2 »)
      if (this.peek()?.t === ')') this.pos++;
      else if (this.pos < this.toks.length) throw new CalcError('parenthèse manquante');
      return v;
    }
    if (tok.t === 'id') {
      this.pos++;
      if (tok.v in FUNCS) {
        const fn = FUNCS[tok.v];
        if (this.peek()?.t === '(') return fn(this.primary());
        // « sqrt 16 » sans parenthèses
        return fn(this.power());
      }
      if (tok.v in CONSTS) return CONSTS[tok.v];
      throw new CalcError(`inconnu « ${tok.v} »`);
    }
    throw new CalcError('expression invalide');
  }
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new CalcError('factorielle invalide');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export interface CalcResult {
  value: number;
  /** Résultat formaté (virgule si l'expression en contenait une). */
  text: string;
  decimalComma: boolean;
}

/** Formate sans bruit flottant (0.1+0.2 → 0.3), 12 chiffres significatifs max. */
export function formatNumber(value: number, decimalComma: boolean): string {
  if (!Number.isFinite(value)) throw new CalcError('résultat infini');
  let text: string;
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    text = value.toExponential(10).replace(/\.?0+e/, 'e');
  } else {
    text = String(Number.parseFloat(value.toPrecision(12)));
    if (text.includes('e')) text = value.toFixed(10).replace(/\.?0+$/, '');
  }
  if (text === '-0') text = '0';
  return decimalComma ? text.replace('.', ',') : text;
}

export function evaluate(expression: string): CalcResult {
  const { tokens, decimalComma } = tokenize(expression);
  if (tokens.length === 0) throw new CalcError('vide');
  const value = new Parser(tokens).parse();
  return { value, text: formatNumber(value, decimalComma), decimalComma };
}

/**
 * La requête ressemble-t-elle à un calcul ? (évite de répondre « = 42 » à
 * « 42 » tout seul ou à un mot quelconque).
 */
export function looksLikeMath(query: string): boolean {
  const q = query.trim();
  if (q.length < 2) return false;
  if (!/[0-9π]|\bpi\b|\be\b/i.test(q)) return false;
  // un nombre seul n'est pas un calcul
  if (/^[+-]?\d+([.,]\d+)?$/.test(q)) return false;
  // doit contenir un opérateur, une parenthèse ou une fonction connue
  const hasOp = /[+\-*/^%!×÷−()]|\*\*/.test(q) || /\d\s*x\s*\d/i.test(q);
  const hasFn = new RegExp(`\\b(${Object.keys(FUNCS).join('|')})\\b`, 'i').test(q);
  const hasConst = /\b(pi|tau)\b|π/i.test(q);
  return hasOp || hasFn || hasConst;
}

/** Évalue si possible, sinon null (jamais d'exception). */
export function tryCalculate(query: string): CalcResult | null {
  if (!looksLikeMath(query)) return null;
  // une date (2026-11-04) ou un numéro de téléphone n'est pas un calcul utile
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.trim())) return null;
  try {
    const r = evaluate(query);
    return Number.isFinite(r.value) ? r : null;
  } catch {
    return null;
  }
}
