/**
 * 関数電卓 v2 - JavaScript ロジック
 *
 * 機能：
 * - 四則演算＋優先順位（× ÷ ^ を + − より先に評価）
 * - 単項関数: sin / cos / tan / log / ln / √ / x² / 1/x
 * - 二項演算子: x^y
 * - 定数: π / e
 * - 角度モード: DEG / RAD
 * - Sci トグル
 * - メモリ: MC / MR / M+ / M−
 * - 履歴 + 設定の localStorage 永続化
 */

class ScientificCalculator {
    constructor() {
        // DOM
        this.display = document.getElementById('display');
        this.expression = document.getElementById('expression');
        this.memoryIndicator = document.getElementById('memoryIndicator');
        this.historyList = document.getElementById('history');
        this.clearHistoryBtn = document.getElementById('clearHistory');
        this.angleToggle = document.getElementById('angleToggle');
        this.sciToggle = document.getElementById('sciToggle');
        this.sciButtons = document.getElementById('sciButtons');

        // 入力状態
        this.currentValue = '0';
        this.shouldResetDisplay = false;

        // 二段階優先順位の評価状態
        // 低優先（+ −）: lowAcc を左オペランドとして lowOp を待機
        // 高優先（* / ^）: highAcc を左オペランドとして highOp を待機
        this.lowAcc = null;
        this.lowOp = null;
        this.highAcc = null;
        this.highOp = null;
        this.expressionStr = '';

        // メモリ
        this.memory = 0;

        // モード
        this.angleMode = 'DEG';
        this.sciMode = true;

        // 履歴
        this.history = [];

        // 初期化
        this.loadHistory();
        this.loadPreferences();
        this.loadMemory();
        this.setupEventListeners();
        this.applyAngleMode();
        this.applySciMode();
        this.updateMemoryIndicator();
        this.updateDisplay();
    }

    setupEventListeners() {
        document.querySelectorAll('[data-number]').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleNumber(e.currentTarget.dataset.number));
        });
        document.querySelectorAll('[data-operator]').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleOperator(e.currentTarget.dataset.operator));
        });
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                if (action === 'clear') this.clear();
                if (action === 'backspace') this.backspace();
                if (action === 'equals') this.calculate();
                if (action === 'percent') this.percent();
                if (action === 'negate') this.negate();
            });
        });
        document.querySelectorAll('[data-fn]').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyUnary(e.currentTarget.dataset.fn));
        });
        document.querySelectorAll('[data-const]').forEach(btn => {
            btn.addEventListener('click', (e) => this.insertConstant(e.currentTarget.dataset.const));
        });
        document.querySelectorAll('[data-memory]').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleMemory(e.currentTarget.dataset.memory));
        });

        this.angleToggle.addEventListener('click', () => this.toggleAngleMode());
        this.sciToggle.addEventListener('click', () => this.toggleSciMode());
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());

        document.addEventListener('keydown', (e) => this.handleKeypress(e));
    }

    /* ----------------------------------------------------------
       数字入力
    ---------------------------------------------------------- */
    handleNumber(num) {
        if (this.shouldResetDisplay) {
            this.currentValue = num === '.' ? '0.' : num;
            this.shouldResetDisplay = false;
        } else {
            if (num === '.' && this.currentValue.includes('.')) return;
            if (this.currentValue === '0' && num !== '.') {
                this.currentValue = num;
            } else {
                this.currentValue += num;
            }
        }
        this.updateDisplay();
    }

    /* ----------------------------------------------------------
       二項演算（× ÷ ^ を先に評価する）
    ---------------------------------------------------------- */
    isHighPriority(op) {
        return op === '*' || op === '/' || op === '^';
    }

    applyBinary(op, a, b) {
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/':
                if (b === 0) { this.showError('0で割ることはできません'); return null; }
                return a / b;
            case '^': return Math.pow(a, b);
        }
        return null;
    }

    handleOperator(op) {
        const isHigh = this.isHighPriority(op);
        const symbol = this.getOperatorSymbol(op);

        // 連続して演算子を押した場合は記号だけ置き換え
        if (this.shouldResetDisplay) {
            if (isHigh) {
                if (this.highOp !== null) {
                    this.highOp = op;
                } else if (this.lowOp !== null) {
                    // 低優先 → 高優先 に乗り換え
                    this.highAcc = parseFloat(this.currentValue);
                    this.highOp = op;
                    this.lowAcc = null;
                    this.lowOp = null;
                }
            } else {
                if (this.lowOp !== null) {
                    this.lowOp = op;
                } else if (this.highOp !== null) {
                    // 高優先 → 低優先 に乗り換え
                    this.lowAcc = parseFloat(this.currentValue);
                    this.lowOp = op;
                    this.highAcc = null;
                    this.highOp = null;
                }
            }
            this.expressionStr = this.expressionStr.replace(/\s[+−×÷^]\s$/, ` ${symbol} `);
            this.updateExpression();
            return;
        }

        const x = parseFloat(this.currentValue);
        if (isNaN(x)) return;
        const displayValue = this.currentValue;

        if (isHigh) {
            // 高優先連鎖（左結合）：保留中の高優先を即確定
            let leftForHigh = x;
            if (this.highOp !== null) {
                const r = this.applyBinary(this.highOp, this.highAcc, x);
                if (r === null) return;
                leftForHigh = r;
            }
            this.highAcc = leftForHigh;
            this.highOp = op;
            this.currentValue = this.roundResult(leftForHigh).toString();
        } else {
            // 低優先：保留中の高優先 → 低優先 を順に確定
            let resolved = x;
            if (this.highOp !== null) {
                const r = this.applyBinary(this.highOp, this.highAcc, x);
                if (r === null) return;
                resolved = r;
                this.highOp = null;
                this.highAcc = null;
            }
            if (this.lowOp !== null) {
                const r = this.applyBinary(this.lowOp, this.lowAcc, resolved);
                if (r === null) return;
                resolved = r;
            }
            this.lowAcc = resolved;
            this.lowOp = op;
            this.currentValue = this.roundResult(resolved).toString();
        }

        this.expressionStr += `${this.formatNumber(displayValue)} ${symbol} `;
        this.shouldResetDisplay = true;
        this.updateExpression();
        this.updateDisplay();
    }

    calculate() {
        if (this.lowOp === null && this.highOp === null) return;
        if (this.shouldResetDisplay) return;

        const x = parseFloat(this.currentValue);
        if (isNaN(x)) return;
        const displayValue = this.currentValue;

        let resolved = x;
        if (this.highOp !== null) {
            const r = this.applyBinary(this.highOp, this.highAcc, x);
            if (r === null) return;
            resolved = r;
        }
        if (this.lowOp !== null) {
            const r = this.applyBinary(this.lowOp, this.lowAcc, resolved);
            if (r === null) return;
            resolved = r;
        }

        const fullExpr = this.expressionStr + this.formatNumber(displayValue);
        const rounded = this.roundResult(resolved);
        this.addHistoryEntry(`${fullExpr} = ${this.formatNumber(rounded.toString())}`);

        this.expressionStr = '';
        this.currentValue = rounded.toString();
        this.lowAcc = null;
        this.lowOp = null;
        this.highAcc = null;
        this.highOp = null;
        this.shouldResetDisplay = true;

        this.updateExpression();
        this.updateDisplay();
    }

    /* ----------------------------------------------------------
       単項関数
    ---------------------------------------------------------- */
    applyUnary(fn) {
        const x = parseFloat(this.currentValue);
        if (isNaN(x)) return;

        let result;
        let label;

        switch (fn) {
            case 'sin':
                result = Math.sin(this.toRadians(x));
                label = `sin(${this.formatNumber(this.currentValue)}${this.angleMode === 'DEG' ? '°' : ''})`;
                break;
            case 'cos':
                result = Math.cos(this.toRadians(x));
                label = `cos(${this.formatNumber(this.currentValue)}${this.angleMode === 'DEG' ? '°' : ''})`;
                break;
            case 'tan':
                if (this.angleMode === 'DEG' && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) {
                    this.showError('tan の定義域外です');
                    return;
                }
                result = Math.tan(this.toRadians(x));
                label = `tan(${this.formatNumber(this.currentValue)}${this.angleMode === 'DEG' ? '°' : ''})`;
                break;
            case 'log10':
                if (x <= 0) { this.showError('log は正の数のみ'); return; }
                result = Math.log10(x);
                label = `log(${this.formatNumber(this.currentValue)})`;
                break;
            case 'ln':
                if (x <= 0) { this.showError('ln は正の数のみ'); return; }
                result = Math.log(x);
                label = `ln(${this.formatNumber(this.currentValue)})`;
                break;
            case 'sqrt':
                if (x < 0) { this.showError('√ は非負の数のみ'); return; }
                result = Math.sqrt(x);
                label = `√(${this.formatNumber(this.currentValue)})`;
                break;
            case 'square':
                result = x * x;
                label = `(${this.formatNumber(this.currentValue)})²`;
                break;
            case 'recip':
                if (x === 0) { this.showError('0 の逆数は定義されません'); return; }
                result = 1 / x;
                label = `1/(${this.formatNumber(this.currentValue)})`;
                break;
            default:
                return;
        }

        result = this.roundResult(result);
        this.currentValue = result.toString();
        this.shouldResetDisplay = true;
        this.addHistoryEntry(`${label} = ${this.formatNumber(this.currentValue)}`);
        this.updateDisplay();
    }

    /* ----------------------------------------------------------
       定数・補助操作
    ---------------------------------------------------------- */
    insertConstant(name) {
        const value = name === 'pi' ? Math.PI : Math.E;
        this.currentValue = this.roundResult(value).toString();
        this.shouldResetDisplay = true;
        this.updateDisplay();
    }

    percent() {
        const x = parseFloat(this.currentValue);
        if (isNaN(x)) return;
        this.currentValue = this.roundResult(x / 100).toString();
        this.updateDisplay();
    }

    negate() {
        if (this.currentValue === '0') return;
        if (this.currentValue.startsWith('-')) {
            this.currentValue = this.currentValue.slice(1);
        } else {
            this.currentValue = '-' + this.currentValue;
        }
        this.updateDisplay();
    }

    clear() {
        this.currentValue = '0';
        this.lowAcc = null;
        this.lowOp = null;
        this.highAcc = null;
        this.highOp = null;
        this.expressionStr = '';
        this.shouldResetDisplay = false;
        this.updateDisplay();
        this.updateExpression();
    }

    backspace() {
        if (this.shouldResetDisplay) return;
        if (this.currentValue.length === 1 ||
            (this.currentValue.length === 2 && this.currentValue.startsWith('-'))) {
            this.currentValue = '0';
        } else {
            this.currentValue = this.currentValue.slice(0, -1);
        }
        this.updateDisplay();
    }

    /* ----------------------------------------------------------
       メモリ機能
    ---------------------------------------------------------- */
    handleMemory(action) {
        const x = parseFloat(this.currentValue);
        switch (action) {
            case 'add':
                if (!isNaN(x)) this.memory = this.roundResult(this.memory + x);
                this.shouldResetDisplay = true;
                break;
            case 'sub':
                if (!isNaN(x)) this.memory = this.roundResult(this.memory - x);
                this.shouldResetDisplay = true;
                break;
            case 'recall':
                this.currentValue = this.memory.toString();
                this.shouldResetDisplay = true;
                this.updateDisplay();
                break;
            case 'clear':
                this.memory = 0;
                break;
        }
        this.saveMemory();
        this.updateMemoryIndicator();
    }

    updateMemoryIndicator() {
        if (!this.memoryIndicator) return;
        if (this.memory !== 0) {
            this.memoryIndicator.textContent = 'M';
            this.memoryIndicator.classList.add('active');
        } else {
            this.memoryIndicator.textContent = '';
            this.memoryIndicator.classList.remove('active');
        }
    }

    saveMemory() {
        localStorage.setItem('sciCalcMemory', this.memory.toString());
    }

    loadMemory() {
        const m = localStorage.getItem('sciCalcMemory');
        if (m !== null) {
            const v = parseFloat(m);
            if (!isNaN(v)) this.memory = v;
        }
    }

    /* ----------------------------------------------------------
       角度モード / Sci モード
    ---------------------------------------------------------- */
    toRadians(x) {
        return this.angleMode === 'DEG' ? x * Math.PI / 180 : x;
    }

    toggleAngleMode() {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.applyAngleMode();
        this.savePreferences();
    }

    applyAngleMode() {
        this.angleToggle.textContent = this.angleMode;
        this.angleToggle.dataset.mode = this.angleMode;
        this.angleToggle.classList.toggle('active', this.angleMode === 'RAD');
    }

    toggleSciMode() {
        this.sciMode = !this.sciMode;
        this.applySciMode();
        this.savePreferences();
    }

    applySciMode() {
        this.sciButtons.classList.toggle('hidden', !this.sciMode);
        this.sciToggle.classList.toggle('active', this.sciMode);
    }

    /* ----------------------------------------------------------
       履歴
    ---------------------------------------------------------- */
    addHistoryEntry(entry) {
        this.history.unshift(entry);
        if (this.history.length > 50) this.history.pop();
        this.saveHistory();
        this.renderHistory();
    }

    clearHistory() {
        if (confirm('計算履歴をすべて削除しますか？')) {
            this.history = [];
            this.saveHistory();
            this.renderHistory();
        }
    }

    saveHistory() {
        localStorage.setItem('sciCalcHistory', JSON.stringify(this.history));
    }

    loadHistory() {
        const saved = localStorage.getItem('sciCalcHistory');
        if (saved) {
            try { this.history = JSON.parse(saved); }
            catch (e) { this.history = []; }
        }
        this.renderHistory();
    }

    renderHistory() {
        this.historyList.innerHTML = '';
        if (this.history.length === 0) {
            const li = document.createElement('li');
            li.className = 'history-empty';
            li.textContent = '履歴なし';
            this.historyList.appendChild(li);
            return;
        }
        this.history.forEach((entry) => {
            const li = document.createElement('li');
            li.textContent = entry;
            li.addEventListener('click', () => this.restoreFromHistory(entry));
            this.historyList.appendChild(li);
        });
    }

    restoreFromHistory(entry) {
        const result = entry.split(' = ').pop();
        this.currentValue = result.replace(/,/g, '');
        this.shouldResetDisplay = true;
        this.updateDisplay();
    }

    /* ----------------------------------------------------------
       環境設定の永続化
    ---------------------------------------------------------- */
    savePreferences() {
        localStorage.setItem('sciCalcPrefs', JSON.stringify({
            angleMode: this.angleMode,
            sciMode: this.sciMode,
        }));
    }

    loadPreferences() {
        const saved = localStorage.getItem('sciCalcPrefs');
        if (!saved) return;
        try {
            const prefs = JSON.parse(saved);
            if (prefs.angleMode === 'RAD' || prefs.angleMode === 'DEG') this.angleMode = prefs.angleMode;
            if (typeof prefs.sciMode === 'boolean') this.sciMode = prefs.sciMode;
        } catch (e) { /* ignore */ }
    }

    /* ----------------------------------------------------------
       表示・整形
    ---------------------------------------------------------- */
    updateDisplay() {
        let fontSize = '2.5em';
        if (this.currentValue.length > 14) fontSize = '1.5em';
        else if (this.currentValue.length > 10) fontSize = '1.9em';
        else if (this.currentValue.length > 8) fontSize = '2.2em';
        this.display.style.fontSize = fontSize;
        this.display.textContent = this.formatNumber(this.currentValue);
    }

    updateExpression() {
        this.expression.textContent = this.expressionStr;
    }

    getOperatorSymbol(op) {
        return { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' }[op] || op;
    }

    roundResult(x) {
        if (!isFinite(x)) return x;
        if (x === 0) return 0;
        const abs = Math.abs(x);
        if (abs >= 1e16 || abs < 1e-9) {
            return Number(x.toPrecision(12));
        }
        return Math.round(x * 1e10) / 1e10;
    }

    formatNumber(numStr) {
        if (numStr === '' || numStr === '-') return numStr || '0';
        const n = Number(numStr);
        if (!isFinite(n)) return String(numStr);

        const abs = Math.abs(n);
        if (abs !== 0 && (abs >= 1e16 || abs < 1e-6)) {
            return n.toExponential(6).replace(/\.?0+e/, 'e');
        }

        const negative = numStr.startsWith('-');
        const body = negative ? numStr.slice(1) : numStr;
        const parts = body.split('.');
        const intPart = parts[0] || '0';
        const decimalPart = parts[1];
        const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        let out = decimalPart !== undefined ? `${formattedInt}.${decimalPart}` : formattedInt;
        return negative ? `-${out}` : out;
    }

    showError(msg) {
        alert(msg);
        this.clear();
    }

    /* ----------------------------------------------------------
       キーボード
    ---------------------------------------------------------- */
    handleKeypress(e) {
        if (e.key >= '0' && e.key <= '9') { this.handleNumber(e.key); e.preventDefault(); return; }
        if (e.key === '.') { this.handleNumber('.'); e.preventDefault(); return; }
        if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
            if (e.ctrlKey || e.metaKey) return;
            this.handleOperator(e.key); e.preventDefault(); return;
        }
        if (e.key === '^') { this.handleOperator('^'); e.preventDefault(); return; }
        if (e.key === 'Enter' || e.key === '=') { this.calculate(); e.preventDefault(); return; }
        if (e.key === 'Escape') { this.clear(); e.preventDefault(); return; }
        if (e.key === 'Backspace') { this.backspace(); e.preventDefault(); return; }
        if (e.key === '%') { this.percent(); e.preventDefault(); return; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ScientificCalculator();
});
