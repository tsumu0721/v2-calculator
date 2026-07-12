# Grasshopper学習 引き継ぎナレッジ

作成日: 2026-07-06 / 出典: Claude との過去チャット(プロジェクト外)の要約

## 学習者プロフィールと目標

- Rhinoceros / Grasshopper は初心者。エンジニアリング・Linux・Python の素養あり
- 最終目標: ガウディ(サグラダ・ファミリア)的な形態のパラメトリック生成と、Karamba3D による構造解析まで
- Claude Code を併用してコード生成・データ処理・帳票化を行う方針
- 環境: Rhino 8(Python 3 対応)、Kangaroo 2(同梱)、Karamba3D(要インストール)
- 詳細は別添「ガウディ_デジタルデザイン実践ガイド.html」を参照(Phase 0〜Capstone の全体設計)

## ツールの役割分担(合意済み)

- Rhino: 表示・編集・保存の土台。基本コマンドのみ学習
- Grasshopper: 形の手順を組む。最重要はデータツリーの理解
- Kangaroo 2: 逆さ吊り実験(フォームファインディング)
- Karamba3D: 構造解析(定型パイプライン: 要素化→断面材料→支持荷重→組立解析→結果)
- Claude Code: GHPython コード生成、CSV/JSON処理、レポート生成、質問相手
- 分業方針: 形の定義と可視化はGHキャンバス、複雑なロジックはPythonに寄せる

## 基本操作(説明済み)

- 起動: Rhinoコマンド欄に `Grasshopper`
- コンポーネント配置: キャンバスをダブルクリック→名前検索
- 配線: 右側=出力、左側=入力。左ドラッグで接続。Shift併用で合流、Ctrl併用で切断
- Number Slider: ダブルクリックし「0.0<5.0<10.0」形式で直接生成
- Panel: 配線途中に挿してデータを覗く。デバッグの基本
- Preview オフ/Disable/警告(橙)・エラー(赤)の見方
- Bake: 右クリック→Bake で初めてRhino実データ化。.gh と .3dm は別々に保存
- Group(Ctrl+G)+名前付けで整理

## 練習課題(提示済み・順に実施)

1. 動く円: Circle + Slider(半径)、Moveで移動 — コンポーネント・配線・Bakeの習得
2. 円の塔: Series → Unit Z → Move、Graph Mapperで先細り — リスト処理の感覚
3. サイン波の柱列: Series → Expression(sin) → Cylinder — 数式とリスト対応
4. 2曲線のLoft壁: Rhino曲線をSet → Loft → Contour — Rhinoジオメトリ参照
5. 最初のカテナリー: 標準の Catenary コンポーネント → Mirror で反転アーチ — ガウディへの入口

現在の進捗: 基本操作の説明まで完了。練習1から着手予定。

## つまずき対策(合意済みの進め方)

- データツリーで迷ったら Panel のパス表示(例 {0;0} N=10)をそのまま Claude に貼って質問
- Flatten / Graft / Simplify の3操作を最優先で習得
- エラー文・ツリー表示は要約せず原文を貼る
- 1つの.ghに詰め込まず、geometry / formfinding / analysis を分けて exchange/(CSV・JSON)経由で接続
- 単位系は m・kN・MPa に統一(構造解析での事故防止)

## この先の到達点(ガイド準拠)

- Phase 3: Kangaroo による逆さ吊り(Anchor + Load + Length + Solver)→ 反転で圧縮アーチ
- Phase 4: Karamba3D で半円・放物線・カテナリーの3アーチ曲げ比較(カテナリーのみMがほぼゼロになることを確認)
- Capstone: 身廊1ベイ(樹状柱4本+ヴォールト)の生成→解析→Galapagos最適化→レポート自動生成
- 目安: 合計8〜12週

## 関連する周辺文脈(参考)

- ユーザーは grid_search.py(Config/Runner/GridSearch構造のパラメータ探索基盤)を保有。GHの最適化やCLI解析プログラムとの連携に流用可能
- 自作のオーケストレーターAIエージェント「CEO」をPC上で運用(サブエージェントに仕事を割り振り本人に報告)。scripts/ 配下の処理をタスクとして割り振る構成と親和
- GUIのない自作構造解析プログラム(テキスト入力)があり、Claude CodeでのGUI化(質点系バネマス→将来3次元)を検討中

## Claudeへの依頼テンプレート

- コード生成:「Rhino 8のGHPython(Python 3)で◯◯を生成するコンポーネントを書いて。入力: …、出力: …。Rhino.Geometry を使って」
- ツリー相談:「この2入力を対応させたい。パス構造は {…} N=…、{…} N=…。Flatten/Graftのどれを何に掛ける?」
- 検算:「このGroupは何をしているか説明して」(自分の理解との突き合わせ)
