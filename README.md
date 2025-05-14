# サーバーレスファイル共有システム

AWS のサーバーレス技術を活用した、安全で拡張性の高いファイル共有システムです。AWS Amplify、Cognito、S3、Lambda などを利用し、セキュリティを重視した設計になっています。

## システム概要

本システムは以下の機能を提供します：

- **社内ユーザー認証**: Cognito User Pool による安全なユーザー認証
- **ファイルアップロード**: S3に複数ファイルをアップロード
- **アクセス制御**: パスワード保護とIP制限によるセキュリティ強化
- **有効期限設定**: ファイル共有の有効期限と自動削除機能
- **外部ユーザー共有**: URLとパスワードによる安全な共有
- **ログ記録**: アクセスとダウンロードの詳細なログ

## アーキテクチャ

本システムは以下のAWSサービスを利用しています：

- **AWS Cognito**: ユーザー認証
- **AWS S3**: ファイルストレージ
- **AWS Lambda**: APIバックエンド
- **AWS API Gateway**: REST API
- **AWS DynamoDB**: メタデータとログ保存
- **AWS CloudFront**: コンテンツ配信
- **AWS WAF**: IP制限とセキュリティルール
- **AWS SES**: メール通知

### アーキテクチャ図

```
┌─────────────┐      ┌──────────────┐      ┌────────────────┐
│  CloudFront │ ──── │ React フロント │ ──── │ Cognito 認証   │
└─────────────┘      └──────────────┘      └────────────────┘
       │                     │                     │
       │                     ▼                     │
       │             ┌──────────────┐              │
       └────────────► API Gateway   ◄──────────────┘
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐         ┌────────────┐
                     │   Lambda     │ ──────► │ DynamoDB   │
                     └──────────────┘         └────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │     S3       │
                     └──────────────┘
```

## 実装機能一覧

### 完了した機能
- ✅ AWS CDKによるインフラストラクチャのコード化
- ✅ Cognito User Poolによるユーザー認証
- ✅ React + Tailwind CSSによるフロントエンド基盤
- ✅ ログイン機能
- ✅ パスワードリセット機能
- ✅ 認証状態管理
- ✅ 認証ルーティング (プライベート/パブリックルート)
- ✅ ファイルアップロード機能
- ✅ ファイル共有リンク生成
- ✅ ファイル管理ダッシュボード
- ✅ ドラッグ＆ドロップによるファイルアップロード
- ✅ パスワード保護機能
- ✅ 有効期限設定
- ✅ アップロード進捗表示
- ✅ ファイル共有URL生成
- ✅ ファイル一覧表示
- ✅ ファイルグループ削除機能
- ✅ 共有ページの実装（パスワード認証）
- ✅ 期限切れファイルの自動管理

### 今後実装予定の機能
- 📅 アクセスログの可視化
- 📅 特定メールアドレスへの制限機能の強化
- 📅 管理者向けユーザー管理機能
- 📅 ダウンロード統計の表示
- 📅 ファイルプレビュー機能

## セットアップガイド

### 前提条件

- Node.js 18.x 以上
- AWS CLIのインストールと設定
- AWS CDKのインストール
- AWS アカウント

### インストール手順

1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/serverless-file-sharing-system.git
cd serverless-file-sharing-system
```

2. 依存関係のインストール

```bash
# バックエンド (CDK)
cd cdk
npm install

# Lambda関数
cd ../lambda
npm install

# フロントエンド
cd ../frontend
npm install
```

3. CDKデプロイ

AWS環境へのデプロイは以下の手順で行います：

```bash
cd cdk
npm run build     # TypeScriptコンパイル
npm run cdk bootstrap  # 初回のみ
npm run cdk deploy     # インフラストラクチャをデプロイ
```

4. フロントエンドの環境変数設定

CDKデプロイ後に出力される値を`.env.local`ファイルに設定します：

```
REACT_APP_AWS_REGION=ap-northeast-1
REACT_APP_USER_POOL_ID=your-user-pool-id
REACT_APP_USER_POOL_CLIENT_ID=your-client-id
REACT_APP_IDENTITY_POOL_ID=your-identity-pool-id
REACT_APP_API_ENDPOINT=your-api-endpoint
REACT_APP_S3_BUCKET=your-file-storage-bucket
REACT_APP_CLOUDFRONT_DOMAIN=your-cloudfront-domain
```

5. フロントエンドのビルドとデプロイ

```bash
cd frontend
npm run build

# S3にデプロイ（CDK出力のWebsiteBucketを使用）
aws s3 sync build/ s3://your-website-bucket/ --delete
```

### 初期ユーザーの作成

AWS CLI を使用して初期管理者ユーザーを作成します：

```bash
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@example.com \
  --temporary-password Temp@123456 \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true
```

初回ログイン時に、ユーザーは一時パスワードを変更する必要があります。新しいパスワードは12文字以上で、大文字/小文字/数字/記号をすべて含む必要があります。

## 開発ガイド

### フロントエンド

React アプリケーションは以下のコンポーネントで構成されています：

- **AuthContext**: 認証状態管理
- **LoginScreen**: ログインとパスワードリセット
- **Dashboard**: メインダッシュボード
- **FileUpload**: ファイルアップロードコンポーネント
- **FileList**: ファイル一覧表示コンポーネント
- **SharePage**: 共有リンク閲覧ページ
- **PrivateRoute/PublicRoute**: 認証状態に基づくルーティング

#### ディレクトリ構造

```
frontend/
├── public/          # 静的ファイル
├── src/
│   ├── components/  # UIコンポーネント
│   ├── contexts/    # React Context
│   ├── lib/         # ユーティリティ
│   ├── services/    # API通信
│   ├── App.js       # メインコンポーネント
│   └── index.js     # エントリーポイント
└── package.json     # 依存関係
```

#### 開発サーバーの起動

```bash
cd frontend
npm start
```

### バックエンド

Lambda関数が以下のAPIエンドポイントを処理します：

- **/auth**: ログインと認証
- **/users**: ユーザー管理
- **/files**: ファイル操作
- **/access**: アクセス権限管理
- **/logs**: ログ管理

#### Lambda関数の開発

新しいAPIエンドポイントを実装する場合は、`lambda/` ディレクトリに関数を追加し、`lambda/index.js` でルーティングを設定します。

```javascript
// lambda/index.js に新しいエンドポイントを追加する例
if (path === '/files' && httpMethod === 'POST') {
  return await fileFunctions.handleFileUpload(event, context);
}
```

## CDK スタックのカスタマイズ

インフラストラクチャのカスタマイズは `cdk/lib/file-share-system-stack.ts` で行います。

### カスタマイズ例

#### S3バケットのライフサイクルルールの変更

```typescript
const fileStorageBucket = new s3.Bucket(this, 'FileStorageBucket', {
  // 他の設定...
  lifecycleRules: [
    {
      id: 'AutoDeleteAfterExpiration',
      enabled: true,
      expiration: cdk.Duration.days(90), // 90日後に自動削除
      noncurrentVersionExpiration: cdk.Duration.days(7),
    },
  ],
});
```

#### WAFルールの追加

```typescript
// IPアドレス制限ルールの追加
const wafIpSet = new waf.CfnIPSet(this, 'AllowedIpSet', {
  addresses: ['192.168.1.0/24', '10.0.0.0/16'], // 許可するIP範囲
  // 他の設定...
});
```

## 環境変数設定

システムの動作に必要な環境変数を以下に示します。

### Lambda関数用環境変数

| 環境変数名 | 説明 | 必須 |
| --- | --- | --- |
| `USER_POOL_ID` | Cognito User PoolのID | ✅ |
| `USER_POOL_CLIENT_ID` | Cognito User Pool ClientのID | ✅ |
| `IDENTITY_POOL_ID` | Cognito Identity PoolのID | ✅ |
| `FILE_STORAGE_BUCKET` | S3ファイルストレージバケット名 | ✅ |
| `USERS_TABLE` | ユーザー情報用DynamoDBテーブル名 | ✅ |
| `FILE_GROUPS_TABLE` | ファイルグループ用DynamoDBテーブル名 | ✅ |
| `FILES_TABLE` | ファイルメタデータ用DynamoDBテーブル名 | ✅ |
| `ACCESS_PERMISSIONS_TABLE` | アクセス許可用DynamoDBテーブル名 | ✅ |
| `ACCESS_LOGS_TABLE` | アクセスログ用DynamoDBテーブル名 | ✅ |
| `RESET_ATTEMPT_TABLE` | パスワードリセット試行記録用DynamoDBテーブル名 | ✅ |
| `ALLOWED_IP_ADDRESSES` | 許可するIPアドレスの配列（JSON形式） | ✅ |

### フロントエンド用環境変数

`.env.local`ファイルに設定する必要があります：

| 環境変数名 | 説明 | 必須 |
| --- | --- | --- |
| `REACT_APP_AWS_REGION` | AWSリージョン（例: ap-northeast-1） | ✅ |
| `REACT_APP_USER_POOL_ID` | Cognito User PoolのID | ✅ |
| `REACT_APP_USER_POOL_CLIENT_ID` | Cognito User Pool ClientのID | ✅ |
| `REACT_APP_IDENTITY_POOL_ID` | Cognito Identity PoolのID | ✅ |
| `REACT_APP_API_ENDPOINT` | API GatewayのURL | ✅ |
| `REACT_APP_S3_BUCKET` | S3ファイルストレージバケット名 | ✅ |
| `REACT_APP_CLOUDFRONT_DOMAIN` | CloudFrontのドメイン名 | ✅ |

## セキュリティ対策

システムには以下のセキュリティ機能が実装されています：

1. **IP制限**: 社内IPからのみアップロード可能
2. **パスワード要件**: 12文字以上、英大文字/小文字/数字/記号を含む
3. **ブルートフォース対策**: 試行回数制限と一時的ロック
4. **セキュアなURL**: 一意のURLによる共有
5. **ログ記録**: すべてのアクセスとダウンロードを記録
6. **自動期限切れ**: 設定期間後の自動削除

### セキュリティのベストプラクティス

- 定期的にパスワードを変更する
- 最小権限の原則に従ってIAMポリシーを設定する
- CloudWatchでアクセスログを監視する
- AWS WAFルールを定期的に見直す

## トラブルシューティング

一般的な問題の解決方法：

### 認証エラー

- Cognitoユーザープールの設定を確認
- 一時パスワードが期限切れになっていないことを確認
- ユーザーのステータスがCONFIRMEDであることを確認

```bash
# ユーザーの状態確認
aws cognito-idp admin-get-user --user-pool-id YOUR_POOL_ID --username user@example.com
```

### アップロード失敗

- S3バケットのCORS設定を確認
- IAM権限が正しく設定されていることを確認
- フロントエンドの環境変数が正しいことを確認

### API接続エラー

- API GatewayとLambda間の接続を確認
- CORSヘッダーの設定を確認
- Lambda関数のタイムアウト設定を確認

## 今後の開発計画

1. **ファイルプレビュー機能**: PDFや画像ファイルのプレビュー
2. **高度な検索機能**: メタデータに基づくファイル検索
3. **多要素認証**: MFAの導入
4. **グループ管理**: チーム単位でのファイル共有
5. **モバイル対応**: レスポンシブデザインの強化

## 貢献ガイド

プロジェクトへの貢献を歓迎します。コントリビューションの手順：

1. リポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチをプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## ライセンス

MIT License

---

© 2025 Serverless File Sharing System Project
