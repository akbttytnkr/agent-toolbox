# Contributing

## プラグインの追加方法

### 1. ディレクトリ作成

`plugins/<plugin-name>/` 以下に次の構造を作成:

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json       # プラグインマニフェスト（必須）
├── skills/               # スキル（任意）
│   └── <skill-name>/
│       └── SKILL.md
├── commands/             # コマンド（任意）
│   └── <command-name>.md
├── agents/               # エージェント（任意）
│   └── <agent-name>.md
└── README.md             # プラグイン説明（必須）
```

### 2. plugin.json

```json
{
  "name": "<plugin-name>",
  "version": "0.1.0",
  "description": "プラグインの説明",
  "author": {
    "name": "あなたの名前"
  },
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"]
}
```

### 3. マーケットプレイスへの登録

`.claude-plugin/marketplace.json` の `plugins` 配列にエントリを追加:

```json
{
  "name": "<plugin-name>",
  "source": "./plugins/<plugin-name>",
  "description": "プラグインの説明",
  "version": "0.1.0"
}
```

### 4. CODEOWNERS の更新

`CODEOWNERS` に自分のプラグインディレクトリのオーナーを追加:

```
plugins/<plugin-name>/ @your-github-id
```

### 5. PR 作成

- ブランチ名: `plugin/<plugin-name>`
- PRタイトル: `feat(plugins): add <plugin-name>`
- マーケットプレイス定義の変更はリポジトリ管理者の承認が必要

## 命名規約

- プラグイン名: kebab-case（例: `quality-review`, `api-scaffold`）
- スキル名: kebab-case
- エージェント名: kebab-case

## バージョニング

セマンティックバージョニング（SemVer）に従う。`plugin.json` と `marketplace.json` の両方のバージョンを同期すること。
