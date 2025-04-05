# サーバーレスファイル共有システム

AWS Amplify と Cognito を活用した安全なファイル共有システムの実装です。

## システム概要

本システムは以下の機能を提供します：

- **社内ユーザー認証**: Cognito User Pool による安全なユーザー認証
- **ファイルアップロード**: S3に複数ファイルをアップロード
- **アクセス制御**: パスワード保護とIP制限によるセキュリティ強化
- **有効期限設定**: ファイル共有の有効期限と自動削除機能
- **外部ユーザー共有**: ワンタイムURLとパスワードによる安全な共有
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

## セットアップガイド

### 前提条件

- Node.js 18.x 以上
- AWS CLIのインストールと設定
- AWS CDKのインストール

### インストール手順

1. リポジトリのクローン

```bash
git clone https://github.com/KenjiTakizawa/serverless-file-sharing-system.git
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

```bash
cd cdk
npm run cdk bootstrap  # 初回のみ
npm run cdk deploy
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

## 開発ガイド

### フロントエンド

React アプリケーションは以下のコンポーネントで構成されています：

- **AuthContext**: 認証状態管理
- **LoginScreen**: ログインとパスワードリセット
- **FileUpload**: ファイルアップロードと共有設定
- **AdminDashboard**: 管理機能とログ閲覧

### バックエンド

Lambda関数が以下のAPIエンドポイントを処理します：

- **/auth**: ログインと認証
- **/users**: ユーザー管理
- **/files**: ファイル操作
- **/access**: アクセス権限管理
- **/logs**: ログ管理

## セキュリティ対策

システムには以下のセキュリティ機能が実装されています：

1. **IP制限**: 社内IPからのみアップロード可能
2. **パスワード要件**: 12文字以上、英大文字/小文字/数字/記号を含む
3. **ブルートフォース対策**: 試行回数制限と一時的ロック
4. **セキュアなURL**: ワンタイムURLによる二段階認証
5. **ログ記録**: すべてのアクセスとダウンロードを記録
6. **自動期限切れ**: 設定期間後の自動削除

## カスタマイズと拡張

システムは以下の方法でカスタマイズ可能です：

1. **UI変更**: フロントエンドコードの修正
2. **認証強化**: Cognitoの多要素認証の追加
3. **通知拡張**: 追加のメール通知やSlack連携
4. **ストレージ変更**: S3ライフサイクルポリシーの調整

## トラブルシューティング

一般的な問題の解決方法：

1. **認証エラー**: Cognitoユーザープールの設定を確認
2. **アップロード失敗**: S3バケットのCORSとIAM権限を確認
3. **API接続エラー**: API Gatewayとサーバー間のCORS設定を確認

## ライセンス

MIT License

## サポート

質問や問題がある場合は、以下にお問い合わせください：
support@example.com