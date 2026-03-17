# agent-toolbox

複数のClaude Codeプラグインを管理するマーケットプレイスリポジトリ。

## 構造

```
.claude-plugin/
└── marketplace.json          # 全プラグインの一覧
plugins/
└── <plugin-name>/
    ├── .claude-plugin/
    │   └── plugin.json       # プラグインマニフェスト
    ├── skills/               # スキル
    ├── commands/             # コマンド
    ├── agents/               # エージェント
    └── README.md
```

## 使い方

### マーケットプレイスの登録

```bash
claude plugin marketplace add akbttytnkr/agent-toolbox
```

### プラグインのインストール

```bash
claude plugin install <plugin-name>@agent-toolbox --scope user
```

## プラグインの追加

[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
