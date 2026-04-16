# 経営学部コースモデルナビ

## アプリ概要

経営学部コースモデルナビは、設問への回答結果をもとに、ユーザーに合ったコースモデルを提案するWebアプリです。

- トップ画面でアプリ概要を表示
- 診断画面で設問に回答
- ローディング画面を経由して結果を表示
- 結果画面で上位3件のコースモデルを表示

## データ更新方法

### 更新対象

通常の更新対象は以下の3つです。

- `data/course_models.csv`
- `data/questions.csv`
- `data/weights.csv`

`data/item_eval.csv` は現在のアプリでは使用していません。

### 各CSVの役割

#### `course_models.csv`

コースモデル名と遷移先URLを管理します。

ヘッダー:

```csv
course_model_id,course_model_name,description,link_url
```

#### `questions.csv`

診断画面に表示する設問を管理します。

ヘッダー:

```csv
question_id,label,text
```

#### `weights.csv`

設問ごとの重みを管理します。診断結果の計算に使用します。

ヘッダー:

```csv
course_model_id,question_id,weight
```

### 更新手順

1. `data/` 配下のCSVを編集します。
2. ヘッダー名とファイル名は変更しないでください。
3. コースモデルを追加した場合は、`course_models.csv` だけでなく `weights.csv` にも対応データを追加してください。
4. 設問を追加した場合は、`questions.csv` だけでなく `weights.csv` にも対応データを追加してください。
5. 更新後はcommitしてpushしてください。

### 更新時の注意

- `course_model_id` は重複しないようにしてください。
- `question_id` は重複しないようにしてください。
- `weights.csv` に必要な組み合わせが不足すると、その組み合わせの重みは `0` として扱われます。
- CSVは `UTF-8` で保存してください。

## 以下ソースコードの簡単な説明

読まなくてもあまり支障はないかと思いますが念のため......

### 主要ファイル

- [index.html]
  トップ、診断、ローディング、結果の各画面を持ちます。

- [app.js]
  アプリ本体です。CSV読込、設問表示、スコア計算、画面切替を担当します。

- [style.css]
  `styles/` 配下の各CSSをまとめて読み込みます。

### CSSファイル

- [styles/base.css]
  全体の基本設定
- [styles/background.css]
  背景アニメーション
- [styles/layout-top.css]
  トップ画面のレイアウト
- [styles/buttons-views.css]
  ボタンと画面切替の見た目
- [styles/loading.css]
  偽ローディング画面
- [styles/quiz.css]
  診断画面
- [styles/result-modal.css]
  結果画面と確認モーダル
- [styles/responsive.css]
  レスポンシブ対応

## 補足

このアプリは静的アプリです。CSVをブラウザで読み込み、JavaScriptで診断結果を計算しています。
