// File: js/parser.js
(function (global) {
  'use strict';

  const FUNCTIONS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    sqrt: Math.sqrt,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log10
  };

  const CONSTANTS = {
    pi: Math.PI,
    e: Math.E
  };

  // 長い名前から順に照合する（"exp" を "e" より先に見るため）
  const NAMES = ['sqrt', 'sin', 'cos', 'tan', 'abs', 'exp', 'log', 'ln', 'pi', 'x', 'e'];

  class ParseError extends Error {}

  function normalize(src) {
    let s = String(src)
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/π/g, 'pi')
      .replace(/√/g, 'sqrt');
    s = s.normalize('NFKC').toLowerCase();
    s = s.replace(/[−–—]/g, '-').replace(/[×·・]/g, '*').replace(/÷/g, '/');
    s = s.replace(/^\s*y\s*=/, '');
    return s;
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
        if (!m) {
          throw new ParseError(`数値の書き方が正しくありません（${i + 1}文字目）`);
        }
        tokens.push({ type: 'num', value: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[a-z]/.test(ch)) {
        const rest = src.slice(i);
        const name = NAMES.find((n) => rest.startsWith(n));
        if (!name) {
          const word = /^[a-z]+/.exec(rest)[0];
          throw new ParseError(`「${word}」は使えません。x や sin などを使ってください`);
        }
        tokens.push({ type: FUNCTIONS[name] ? 'func' : 'ident', value: name });
        i += name.length;
        continue;
      }
      if ('+-*/^()|'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }
      throw new ParseError(`「${ch}」は使えない記号です`);
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function parse(src) {
    const text = normalize(src);
    if (!text.trim()) {
      throw new ParseError('式を入力してください');
    }
    const tokens = tokenize(text);
    let pos = 0;
    let absDepth = 0;

    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const isOp = (t, v) => t.type === 'op' && t.value === v;

    function expect(v) {
      const t = next();
      if (!isOp(t, v)) {
        throw new ParseError(`「${v}」が足りません`);
      }
    }

    function startsFactor(t) {
      return (
        t.type === 'num' ||
        t.type === 'ident' ||
        t.type === 'func' ||
        isOp(t, '(') ||
        (isOp(t, '|') && absDepth === 0)
      );
    }

    function parseExpr() {
      let left = parseTerm();
      while (isOp(peek(), '+') || isOp(peek(), '-')) {
        const op = next().value;
        const right = parseTerm();
        const l = left;
        left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
      }
      return left;
    }

    function parseTerm() {
      let left = parseUnary();
      for (;;) {
        const t = peek();
        if (isOp(t, '*') || isOp(t, '/')) {
          next();
          const right = parseUnary();
          const l = left;
          left = t.value === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
        } else if (startsFactor(t)) {
          // 乗算記号の省略（2x, 3sin(x), (x+1)(x-2) など）
          const right = parsePower();
          const l = left;
          left = (x) => l(x) * right(x);
        } else {
          break;
        }
      }
      return left;
    }

    function parseUnary() {
      if (isOp(peek(), '-')) {
        next();
        const u = parseUnary();
        return (x) => -u(x);
      }
      if (isOp(peek(), '+')) {
        next();
        return parseUnary();
      }
      return parsePower();
    }

    function parsePower() {
      const base = parsePrimary();
      if (isOp(peek(), '^')) {
        next();
        const exponent = parseUnary();
        return (x) => Math.pow(base(x), exponent(x));
      }
      return base;
    }

    function parsePrimary() {
      const t = next();
      if (t.type === 'num') {
        const v = t.value;
        return () => v;
      }
      if (t.type === 'ident') {
        if (t.value === 'x') {
          return (x) => x;
        }
        const c = CONSTANTS[t.value];
        return () => c;
      }
      if (t.type === 'func') {
        const f = FUNCTIONS[t.value];
        let arg;
        if (isOp(peek(), '(')) {
          next();
          arg = parseExpr();
          expect(')');
        } else if (peek().type === 'eof') {
          throw new ParseError(`${t.value} の後ろに中身が必要です`);
        } else {
          arg = parsePower();
        }
        return (x) => f(arg(x));
      }
      if (isOp(t, '(')) {
        const inner = parseExpr();
        expect(')');
        return inner;
      }
      if (isOp(t, '|')) {
        absDepth++;
        const inner = parseExpr();
        expect('|');
        absDepth--;
        return (x) => Math.abs(inner(x));
      }
      if (t.type === 'eof') {
        throw new ParseError('式が途中で終わっています');
      }
      throw new ParseError(`「${t.value}」の位置がおかしいようです`);
    }

    const fn = parseExpr();
    if (peek().type !== 'eof') {
      throw new ParseError(`「${peek().value}」の位置がおかしいようです`);
    }
    return { fn, text };
  }


  global.GMParser = { parse, ParseError };
})(typeof window !== 'undefined' ? window : globalThis);