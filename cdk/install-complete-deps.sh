#!/bin/bash

# 基本的な依存関係のインストール
npm install --save aws-cdk-lib constructs source-map-support

# 開発用依存関係のインストール
npm install --save-dev @types/node @types/jest jest ts-jest typescript ts-node @types/source-map-support

# AWS CDK CLI のインストール
npm install -g aws-cdk

# スタック内で使用される AWS サービス用ライブラリ（既に aws-cdk-lib に含まれている）
# 以下は明示的に記載しますが、実際は aws-cdk-lib に含まれています
npm install --save aws-cdk-lib
