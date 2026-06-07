/**
 * 関数電卓 v2 - JavaScript ロジック
 *
 * v1 (四則演算) からの主な拡張：
 * - 単項関数: sin / cos / tan / log / ln / √ / x² / 1/x
 * - 二項演算子: x^y（べき乗）
 * - 定数: π / e
 * - 角度モード: DEG / RAD 切替（三角関数に適用）
 * - Sci トグル: 関数キーの表示／非表示
 * - キーボード対応の拡張
 */

class ScientificCalculator {
    constructor() {
        this.display = document.getElementById('display');
        this.expression = document.getElementById('expression');
        this.historyList = document.getElementById('history');
        this.clearHistoryBtn = document.getElementById('clearHistory');
        this.angleToggle = document.getElementById('angleToggle');
        this.sciToggle = document.getElementById('sciToggle');
        this.sciButtons = document.getElementById('sciButtons');

        this.currentValue = '0';
        this.previousValue = '';
        this.operator = null;
        this.shouldResetDisplay = false;
        this.history = [];

        this.angleMode = 'DEG';
        this.sciMode = true;

        this.loadHistory();
        this.loadPreferences();
        this.setupEventListeners();
        this.applyAngleMode();
        this.applySciMode();
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

        this.angleToggle.addEventListener('click', () => this.toggleAngleMode());
        this.sciToggle.addEventListener('click', () => this.toggleSciMode());
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());

        document.addEventListener('keydown', (e) => this.handleKeypress(e));
    }

    /* ----------------------------------------------------------
       基本入力
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

    handleOperator(op) {
        if (this.operator !== null && !this.shouldResetDisplay) {
            this.executeCalculation();
        }
        this.previousValue = this.currentValue;
        this.operator = op;
        this.shouldResetDisplay = true;
        this.updateExpression();
    }

    calculate() {
        if (this.operator === null || this.shouldResetDisplay) return;
        const prev = parseFloat(this.previousValue);
        const current = parseFloat(this.currentValue);
        const opSymbol = this.getOperatorSymbol(this.operator);
        const entry = `${this.formatNumber(this.previousValue)} ${opSymbol} ${this.formatNumber(this.currentValue)}`;

        this.executeCalculation();

        const result = this.currentValue;
        this.addHistoryEntry(`${entry} = ${this.formatNumber(result)}`);

        this.operator = null;
        this.shouldResetDisplay = true;
        this.updateExpression();
    }

    executeCalculation() {
        const prev = parseFloat(this.previousValue);
        const current = parseFloat(this.currentValue);
        if (isNaN(prev) || isNaN(current)) return;

        let result;
        switch (this.operator) {
            case '+': result = prev + current; break;
            case '-': result = prev - current; break;
            case '*': result = prev * current; break;
            case '/':
                if (current === 0) {
                    this.showError('0で割ることはできません');
                    return;
                }
                result = prev / current;
                break;
            case '^':
                result = Math.pow(prev, current);
                break;
            default: return;
        }

        this.currentValue = this.roundResult(result).toString();
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
        const current = parseFloat(this.currentValue);
        if (this.operator === null) {
            this.currentValue = (current / 100).toString();
        } else {
            const prev = parseFloat(this.previousValue);
            this.currentValue = ((prev * current) / 100).toString();
        }
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
        this.previousValue = '';
        this.operator = null;
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
       環境設定（角度・Sci 表示状態）の永続化
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
        if (this.operator === null) {
            this.expression.textContent = '';
        } else {
            const opSymbol = this.getOperatorSymbol(this.operator);
            this.expression.textContent = `${this.formatNumber(this.previousValue)} ${opSymbol}`;
        }
    }

    getOperatorSymbol(op) {
        return { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' }[op] || op;
    }

    /** 浮動小数点誤差を丸める（指数表記もケア） */
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
