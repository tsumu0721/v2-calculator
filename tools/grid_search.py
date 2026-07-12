"""
グリッドサーチ自動化スクリプト（統合リファクタリング版）

Windows版（subprocess）とLinux/SSH版（paramiko）を1つに統合。
実行環境の違いは Runner クラスの差し替えだけで対応する。

使い方:
    1. 下部の CONFIG / PARAM_GRID を環境に合わせて編集
    2. ローカル実行なら LocalRunner、SSH実行なら SSHRunner を選択
    3. python grid_search.py

依存: pandas, matplotlib（SSH利用時のみ paramiko）
"""

from __future__ import annotations

import itertools
import logging
import shlex
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd
import matplotlib
import matplotlib.pyplot as plt

log = logging.getLogger("grid_search")


# =====================================================================
# 設定
# =====================================================================
@dataclass
class Config:
    """グリッドサーチ全体の設定"""
    template_path: Path              # プレースホルダ入りテンプレート（例: {param_a}）
    param_grid: dict[str, list]      # 総当たりするパラメータ
    result_keyword: str = "Result:"  # 結果ファイル内で値を探すキーワード
    optimize: str = "max"            # "max" or "min"
    results_csv: Path = Path("results.csv")
    plot_png: Path = Path("results.png")
    encoding: str = "utf-8"
    stop_on_error: bool = False      # Trueなら1件のエラーで全体を中断

    def __post_init__(self) -> None:
        if self.optimize not in ("max", "min"):
            raise ValueError(f"optimize は 'max' か 'min': {self.optimize}")
        if not self.param_grid:
            raise ValueError("param_grid が空です")


# =====================================================================
# 実行環境の抽象化（ここだけがWindows版/SSH版で異なる）
# =====================================================================
class Runner(ABC):
    """入力ファイルを配置してアプリを1回実行し、出力テキストを返す"""

    @abstractmethod
    def run_case(self, input_text: str) -> str: ...

    def close(self) -> None:  # 後始末が必要なRunnerだけ上書き
        pass

    def __enter__(self) -> "Runner":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


class LocalRunner(Runner):
    """ローカル（Windows/Linux共通）で subprocess 実行"""

    def __init__(self, app_path: str, input_file: Path, output_file: Path,
                 timeout: int = 600, encoding: str = "utf-8") -> None:
        self.app_path = app_path
        self.input_file = Path(input_file)
        self.output_file = Path(output_file)
        self.timeout = timeout
        self.encoding = encoding

    def run_case(self, input_text: str) -> str:
        self.input_file.write_text(input_text, encoding=self.encoding)
        subprocess.run(
            [self.app_path, str(self.input_file)],
            check=True, timeout=self.timeout,
            capture_output=True,
        )
        return self.output_file.read_text(encoding=self.encoding)


class SSHRunner(Runner):
    """リモートLinuxサーバ上で SSH 実行（paramiko）

    旧版との違い:
      - 接続を1回だけ張って全ケースで使い回す（毎回接続しない）
      - パスワードをコードに直書きせず、鍵認証を推奨
        パスワードが必要な場合は getpass で実行時に入力
    """

    def __init__(self, host: str, user: str, remote_app: str,
                 remote_in: str, remote_out: str,
                 port: int = 22, key_path: str | None = None,
                 timeout: int = 600, encoding: str = "utf-8") -> None:
        import paramiko  # SSH利用時のみ必要

        self.remote_app = remote_app
        self.remote_in = remote_in
        self.remote_out = remote_out
        self.timeout = timeout
        self.encoding = encoding

        self._client = paramiko.SSHClient()
        self._client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        if key_path:
            self._client.connect(host, port=port, username=user,
                                 key_filename=key_path)
        else:
            from getpass import getpass
            self._client.connect(host, port=port, username=user,
                                 password=getpass(f"{user}@{host} password: "))
        self._sftp = self._client.open_sftp()

    def run_case(self, input_text: str) -> str:
        with self._sftp.open(self.remote_in, "w") as f:
            f.write(input_text)

        cmd = f"{shlex.quote(self.remote_app)} {shlex.quote(self.remote_in)}"
        _, stdout, stderr = self._client.exec_command(cmd, timeout=self.timeout)
        rc = stdout.channel.recv_exit_status()
        if rc != 0:
            raise RuntimeError(
                f"リモート実行失敗 (exit={rc}): {stderr.read().decode(errors='replace')}")

        with self._sftp.open(self.remote_out, "r") as f:
            return f.read().decode(self.encoding)

    def close(self) -> None:
        self._sftp.close()
        self._client.close()


# =====================================================================
# グリッドサーチ本体
# =====================================================================
class GridSearch:
    def __init__(self, config: Config, runner: Runner) -> None:
        self.cfg = config
        self.runner = runner
        self._template = config.template_path.read_text(encoding=config.encoding)

    # --- 各ステップ（旧版の make_input / run_app / parse_result に対応） ---
    def _render_input(self, params: dict[str, Any]) -> str:
        text = self._template
        for key, val in params.items():
            text = text.replace(f"{{{key}}}", str(val))
        return text

    def _parse_score(self, output_text: str) -> float | None:
        for line in output_text.splitlines():
            if self.cfg.result_keyword in line:
                return float(line.split(":")[-1].strip())
        return None

    # --- 実行 ---
    def run(self) -> pd.DataFrame:
        keys = list(self.cfg.param_grid.keys())
        combos = list(itertools.product(*self.cfg.param_grid.values()))
        total = len(combos)
        log.info("グリッドサーチ開始: %d ケース", total)

        results = []
        for i, combo in enumerate(combos, 1):
            params = dict(zip(keys, combo))
            try:
                output = self.runner.run_case(self._render_input(params))
                score = self._parse_score(output)
                log.info("[%d/%d] %s -> %s", i, total, params, score)
            except Exception as e:
                if self.cfg.stop_on_error:
                    raise
                log.error("[%d/%d] %s -> エラー: %s", i, total, params, e)
                score = None
            results.append({**params, "score": score})

        df = pd.DataFrame(results)
        df.to_csv(self.cfg.results_csv, index=False, encoding="utf-8-sig")
        log.info("結果を %s に保存", self.cfg.results_csv)
        return df

    # --- 集計 ---
    def best(self, df: pd.DataFrame) -> pd.Series | None:
        valid = df.dropna(subset=["score"])
        if valid.empty:
            return None
        idx = (valid["score"].idxmax() if self.cfg.optimize == "max"
               else valid["score"].idxmin())
        return valid.loc[idx]


# =====================================================================
# 可視化
# =====================================================================
def plot_results(df: pd.DataFrame, param_keys: list[str],
                 save_path: Path | None = None) -> None:
    """パラメータ数に応じて自動でグラフを切り替える
       1個: 折れ線 / 2個: ヒートマップ / 3個以上: 各パラメータの散布図"""
    valid = df.dropna(subset=["score"])
    if valid.empty:
        log.warning("有効な結果がないため可視化をスキップ")
        return

    n = len(param_keys)
    if n == 1:
        k = param_keys[0]
        fig, ax = plt.subplots(figsize=(7, 4.5))
        ax.plot(valid[k], valid["score"], marker="o")
        ax.set_xlabel(k)
        ax.set_ylabel("score")
        ax.grid(alpha=0.3)
    elif n == 2:
        kx, ky = param_keys
        pivot = valid.pivot_table(index=ky, columns=kx, values="score")
        fig, ax = plt.subplots(figsize=(7, 5.5))
        im = ax.imshow(pivot.values, origin="lower", aspect="auto", cmap="viridis")
        ax.set_xticks(range(len(pivot.columns)), pivot.columns)
        ax.set_yticks(range(len(pivot.index)), pivot.index)
        ax.set_xlabel(kx)
        ax.set_ylabel(ky)
        fig.colorbar(im, ax=ax, label="score")
        for yi in range(pivot.shape[0]):
            for xi in range(pivot.shape[1]):
                v = pivot.values[yi, xi]
                if pd.notna(v):
                    ax.text(xi, yi, f"{v:.3g}", ha="center", va="center",
                            color="white", fontsize=9)
    else:
        fig, axes = plt.subplots(1, n, figsize=(4.5 * n, 4), sharey=True)
        for ax, k in zip(axes, param_keys):
            ax.scatter(valid[k], valid["score"], alpha=0.7)
            ax.set_xlabel(k)
            ax.grid(alpha=0.3)
        axes[0].set_ylabel("score")

    fig.suptitle("Grid Search Results")
    fig.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150)
        log.info("グラフを %s に保存", save_path)
    plt.show()


# =====================================================================
# エントリポイント
# =====================================================================
def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    # ---- 設定（環境に合わせて編集）------------------------------------
    cfg = Config(
        template_path=Path("template.txt"),
        param_grid={
            "param_a": [1.0, 2.0, 3.0],
            "param_b": [10, 20, 30],
        },
        result_keyword="Result:",
        optimize="max",
    )

    # ---- 実行環境を選択（どちらか一方）--------------------------------
    runner: Runner = LocalRunner(
        app_path=r"C:\path\to\your_app.exe",
        input_file=Path("input.txt"),
        output_file=Path("output.txt"),
    )
    # runner = SSHRunner(
    #     host="192.168.1.100", user="username",
    #     key_path=r"C:\Users\you\.ssh\id_rsa",   # 鍵認証を推奨
    #     remote_app="/home/username/app/your_app",
    #     remote_in="/home/username/work/input.txt",
    #     remote_out="/home/username/work/output.txt",
    # )

    # ---- 実行 ----------------------------------------------------------
    with runner:
        gs = GridSearch(cfg, runner)
        df = gs.run()
        best = gs.best(df)

    if best is not None:
        log.info("\n=== 最適パラメータ (%s) ===", cfg.optimize)
        for k in cfg.param_grid:
            log.info("  %s: %s", k, best[k])
        log.info("  score: %s", best["score"])
        plot_results(df, list(cfg.param_grid.keys()), save_path=cfg.plot_png)
    else:
        log.warning("有効な結果がありませんでした")


if __name__ == "__main__":
    main()
