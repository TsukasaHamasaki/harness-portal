# harness-portal

**Visualize your Claude Code harness as a capability map.** `npx harness-portal` collects the skills, MCP servers, sub-agents, and plugins on your machine, classifies them with your own Claude, and opens a local page showing what you can do right now — plus task flows built from your tools and findings about duplicated MCP configs. Nothing leaves your machine.

Requirements: Node.js 18+, Claude Code installed and logged in. Works on macOS, Windows, and Linux (WSL). The UI has a JA / EN switch; the CLI follows your OS locale, or pass `--lang en` / `--lang ja`.

Landing page: https://harness-portal-nine.vercel.app/en/ — 日本語は以下。

---

Claude Code のローカルハーネス（スキル、エージェント、MCP、プラグイン、commands、hooks、permissions）を収集・分類し、能力マップとして表示するポータルです。収集対象はローカルの allowlist に限定し、出力前に秘密情報とホームパスをマスクします。

## ローカルで使う

Node.js 18 以降と、インストール済みでログイン済みの Claude Code が必要です（分類とフロー生成にあなたの Claude を使います）。macOS / Windows / Linux（WSL）で動きます。未ログインの場合も動作しますが、分類はキーワード規則になり、フローは生成されません。

```sh
npx harness-portal --no-open
```

既定では `~/.claude` を読み、`127.0.0.1:4477` だけで画面を配信します。よく使うオプションは次のとおりです。

```sh
npx harness-portal --no-agent --stdout
npx harness-portal --out ./harness.json --no-open
npx harness-portal --claude-dir /path/to/.claude --port 4477
npx harness-portal --data-dir /path/to/harness-data --no-open
```

`--lang ja|en` で表示言語を指定できます（未指定なら OS の言語が日本語のときだけ日本語、それ以外は英語。画面上の JA / EN ボタンでも切り替えられます）。`--no-agent` は Claude Agent SDK による分類を使わず、共有キーワード規則で分類します。`--stdout` は JSON を標準出力へ出して終了します。CLI は `--claude-dir` 配下へ書き込みません。

収集に成功したスナップショットは、既定で `~/.harness/snapshots/` に保存されます。ローカル環境の履歴一覧・差分・削除を利用できます。履歴は新しい順に30件まで保持され、上限を超えた古いスナップショットは削除されます。保存したくない場合は `--no-save`、保存先のルートを変更したい場合は `--data-dir <dir>` を指定してください。

出力される JSON のスキーマは [`schema/harness.schema.json`](schema/harness.schema.json) です。

配布パッケージには、利用者および作者のデータは含まれていません。
収集・表示されるハーネスデータは、実行した利用者自身の環境から取得されます。

## 配布

npm に公開しています。

```sh
npx harness-portal
```

GitHub から直接実行することもできます（`dist-app/` はビルド済みで同梱されています）。

```sh
npx github:TsukasaHamasaki/harness-portal --no-open
```

公開手順（メンテナ向け）: `package.json` の `version` を上げてコミットし、同じ番号のタグを push します。
GitHub Actions（`.github/workflows/publish.yml`）がテストとビルドを通したうえで、npm の Trusted Publishing（OIDC）で publish します。手元で `npm publish` は打ちません。

```sh
git tag v0.1.4
git push origin main --tags
```

## 開発者向け検証

```sh
npm ci
npm run build
npm test
```

## ライセンス

MIT License — Copyright (c) 2026 Tsukasa Hamasaki（[LICENSE](LICENSE)）

同梱するサードパーティ成果物の表示は [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にあります。

### 用語集

- allowlist: 読み取ってよいファイルを列挙して限定する方式。
- MCP: Claude Code から外部ツールやサービスへ接続する仕組み。
- SPA: ページ遷移の代わりにブラウザ内で画面を切り替えるWebアプリ。
- `npx`: npmパッケージやGitHub上のCLIをインストール操作なしで実行するコマンド。
