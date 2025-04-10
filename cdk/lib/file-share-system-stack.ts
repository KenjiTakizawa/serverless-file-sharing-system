import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as waf from 'aws-cdk-lib/aws-wafv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export class FileShareSystemStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 環境変数の定義
    const domainName = this.node.tryGetContext('domainName') || 'file-share-system.example.com';
    const allowedIpAddresses = this.node.tryGetContext('allowedIpAddresses') || ['192.0.2.0/24']; // 社内IPアドレス帯
    const certificateArn = this.node.tryGetContext('certificateArn'); // 既存のACM証明書ARN

    // S3バケット: ファイル保存用
    const fileStorageBucket = new s3.Bucket(this, 'FileStorageBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: 'AutoDeleteAfterExpiration',
          enabled: true,
          expiration: cdk.Duration.days(365), // 安全策として最大1年
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: [`https://${domainName}`],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // DynamoDB: メタデータとアクセス権限管理用
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const fileGroupsTable = new dynamodb.Table(this, 'FileGroupsTable', {
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    fileGroupsTable.addGlobalSecondaryIndex({
      indexName: 'UserIdIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'expirationDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const filesTable = new dynamodb.Table(this, 'FilesTable', {
      partitionKey: { name: 'fileId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    filesTable.addGlobalSecondaryIndex({
      indexName: 'GroupIdIndex',
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const accessPermissionsTable = new dynamodb.Table(this, 'AccessPermissionsTable', {
      partitionKey: { name: 'permissionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    accessPermissionsTable.addGlobalSecondaryIndex({
      indexName: 'AccessUrlIndex',
      partitionKey: { name: 'accessUrl', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    
    accessPermissionsTable.addGlobalSecondaryIndex({
      indexName: 'OneTimeUrlIndex',
      partitionKey: { name: 'oneTimeUrl', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    
    accessPermissionsTable.addGlobalSecondaryIndex({
      indexName: 'GroupIdIndex',
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const accessLogsTable = new dynamodb.Table(this, 'AccessLogsTable', {
      partitionKey: { name: 'logId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });
    
    accessLogsTable.addGlobalSecondaryIndex({
      indexName: 'PermissionIdIndex',
      partitionKey: { name: 'permissionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    
    accessLogsTable.addGlobalSecondaryIndex({
      indexName: 'FileIdIndex',
      partitionKey: { name: 'fileId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Cognito User Pool: 社内ユーザー認証用
    const userPool = new cognito.UserPool(this, 'FileShareUserPool', {
      selfSignUpEnabled: false, // 管理者のみがユーザーを作成可能
      autoVerify: { email: true },
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Cognito App Client
    const userPoolClient = userPool.addClient('FileShareAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });

    // Cognito Identity Pool: API との連携用
    const identityPool = new cognito.CfnIdentityPool(this, 'FileShareIdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    // 認証済みロール
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // 認証済みロールにS3アクセス権限を付与
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [
          fileStorageBucket.bucketArn,
          `${fileStorageBucket.bucketArn}/*`,
        ],
      })
    );

    // Identity Pool Role Attachment
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Lambda関数: バックエンドAPI処理用
    const apiHandler = new lambda.Function(this, 'FileShareApiHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'), // コードは別途作成
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        IDENTITY_POOL_ID: identityPool.ref,
        FILE_STORAGE_BUCKET: fileStorageBucket.bucketName,
        USERS_TABLE: usersTable.tableName,
        FILE_GROUPS_TABLE: fileGroupsTable.tableName,
        FILES_TABLE: filesTable.tableName,
        ACCESS_PERMISSIONS_TABLE: accessPermissionsTable.tableName,
        ACCESS_LOGS_TABLE: accessLogsTable.tableName,
        ALLOWED_IP_ADDRESSES: JSON.stringify(allowedIpAddresses),
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Lambda関数のDynamoDBアクセス権限
    apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [
          usersTable.tableArn,
          fileGroupsTable.tableArn,
          filesTable.tableArn,
          accessPermissionsTable.tableArn,
          accessLogsTable.tableArn,
          `${usersTable.tableArn}/index/*`,
          `${fileGroupsTable.tableArn}/index/*`,
          `${filesTable.tableArn}/index/*`,
          `${accessPermissionsTable.tableArn}/index/*`,
          `${accessLogsTable.tableArn}/index/*`,
        ],
      })
    );

    // Lambda関数のS3アクセス権限
    apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
        ],
        resources: [
          fileStorageBucket.bucketArn,
          `${fileStorageBucket.bucketArn}/*`,
        ],
      })
    );

    // Lambda関数のCognitoアクセス権限
    apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminRespondToAuthChallenge',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminResetUserPassword',
        ],
        resources: [userPool.userPoolArn],
      })
    );

    // Lambda関数のSESアクセス権限
    apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'], // 必要に応じて制限
      })
    );

    // API Gateway: RESTful API
    const api = new apigateway.RestApi(this, 'FileShareAPI', {
      description: 'File Sharing System API',
      deployOptions: {
        stageName: 'v1',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    // API Gateway Lambda インテグレーション
    const apiIntegration = new apigateway.LambdaIntegration(apiHandler);

    // API エンドポイント定義
    const usersResource = api.root.addResource('users');
    usersResource.addMethod('POST', apiIntegration); // ユーザー作成
    usersResource.addMethod('GET', apiIntegration);  // ユーザー一覧

    const userResource = usersResource.addResource('{userId}');
    userResource.addMethod('GET', apiIntegration);   // ユーザー取得
    userResource.addMethod('PUT', apiIntegration);   // ユーザー更新
    userResource.addMethod('DELETE', apiIntegration); // ユーザー削除

    const authResource = api.root.addResource('auth');
    authResource.addMethod('POST', apiIntegration);  // ログイン
    
    const resetPasswordResource = authResource.addResource('reset-password');
    resetPasswordResource.addMethod('POST', apiIntegration); // パスワードリセット要求
    
    const confirmResetResource = resetPasswordResource.addResource('confirm');
    confirmResetResource.addMethod('POST', apiIntegration); // パスワードリセット確認
    
    const filesResource = api.root.addResource('files');
    filesResource.addMethod('POST', apiIntegration); // ファイルグループ作成
    filesResource.addMethod('GET', apiIntegration);  // ファイル一覧
    
    const fileGroupResource = filesResource.addResource('{groupId}');
    fileGroupResource.addMethod('GET', apiIntegration);   // ファイルグループ取得
    fileGroupResource.addMethod('PUT', apiIntegration);   // ファイルグループ更新
    fileGroupResource.addMethod('DELETE', apiIntegration); // ファイルグループ削除
    
    const accessResource = api.root.addResource('access');
    accessResource.addMethod('POST', apiIntegration); // アクセス許可作成
    
    const accessUrlResource = accessResource.addResource('{accessUrl}');
    accessUrlResource.addMethod('GET', apiIntegration); // アクセスURL検証
    
    const accessAuthResource = accessUrlResource.addResource('auth');
    accessAuthResource.addMethod('POST', apiIntegration); // アクセス認証
    
    const logsResource = api.root.addResource('logs');
    logsResource.addMethod('GET', apiIntegration); // ログ一覧

    // WAF: IP制限とブルートフォース対策
    const wafIpSet = new waf.CfnIPSet(this, 'AllowedIpSet', {
      addresses: allowedIpAddresses,
      ipAddressVersion: 'IPV4',
      scope: 'REGIONAL',
      name: 'FileShareAllowedIPs',
    });

    const wafWebACL = new waf.CfnWebACL(this, 'FileShareWebACL', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'FileShareWebACL',
        sampledRequestsEnabled: true,
      },
      rules: [
        // IP制限ルール（アップロード関連の管理APIのみに適用）
        {
          name: 'IPRestrictionRule',
          priority: 1,
          action: { block: {} },
          statement: {
            notStatement: {
              statement: {
                ipSetReferenceStatement: {
                  arn: wafIpSet.attrArn,
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'IPRestrictionRule',
            sampledRequestsEnabled: true,
          },
          scopeDownStatement: {
            byteMatchStatement: {
              fieldToMatch: { uriPath: {} },
              positionalConstraint: 'STARTS_WITH',
              searchString: '/users',
              textTransformations: [{ priority: 0, type: 'NONE' }],
            },
          },
        },
        // レートリミット（ブルートフォース対策）
        {
          name: 'RateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 100,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // API Gateway WebACL関連付け
    new waf.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/v1`,
      webAclArn: wafWebACL.attrArn,
    });

    // 自動削除Lambda
    const cleanupHandler = new lambda.Function(this, 'FileCleanupHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cleanup.handler',
      code: lambda.Code.fromAsset('lambda'), // コードは別途作成
      environment: {
        FILE_STORAGE_BUCKET: fileStorageBucket.bucketName,
        FILE_GROUPS_TABLE: fileGroupsTable.tableName,
        FILES_TABLE: filesTable.tableName,
        ACCESS_PERMISSIONS_TABLE: accessPermissionsTable.tableName,
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
    });

    // 自動削除Lambda権限
    cleanupHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:UpdateItem',
        ],
        resources: [
          fileGroupsTable.tableArn,
          filesTable.tableArn,
          `${fileGroupsTable.tableArn}/index/*`,
          `${filesTable.tableArn}/index/*`,
        ],
      })
    );

    cleanupHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:DeleteObject',
        ],
        resources: [
          `${fileStorageBucket.bucketArn}/*`,
        ],
      })
    );

    // EventBridge Rule (毎日深夜に実行)
    new cdk.aws_events.Rule(this, 'DailyCleanupRule', {
      schedule: cdk.aws_events.Schedule.cron({ minute: '0', hour: '3' }), // UTC時間で午前3時
      targets: [new cdk.aws_events_targets.LambdaFunction(cleanupHandler)],
    });

    // React静的ウェブサイトのデプロイ (S3 + CloudFront)
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // CloudFront OAI
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'CloudFrontOAI');
    
    // S3バケットポリシー
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.CanonicalUserPrincipal(
            cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId
          ),
        ],
        resources: [`${websiteBucket.bucketArn}/*`],
      })
    );

    // ACM証明書をインポート
    let certificate;
    if (certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(
        this, 'Certificate', certificateArn
      );
    }

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'FileShareDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity: cloudfrontOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      certificate: certificate,
      domainNames: certificateArn ? [domainName] : undefined,
    });

    // Route 53レコード設定（オプショナル - 証明書がある場合のみ）
    if (certificateArn) {
      const zone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: domainName.split('.').slice(1).join('.'),
      });

      new route53.ARecord(this, 'FileShareAliasRecord', {
        zone,
        recordName: domainName.split('.')[0],
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution)
        ),
      });
    }

    // SES設定 (オプショナル)
    try {
      const verifiedDomain = ses.EmailIdentity.fromEmailIdentityName(
        this, 'VerifiedDomain', domainName.split('.').slice(1).join('.')
      );
    } catch (error) {
      // SESドメイン検証はコンソールで手動で行う必要があるかもしれません
      console.warn('SES domain verification may need to be done manually in the AWS console');
    }

    // 出力
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'ID of the Cognito User Pool',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'ID of the Cognito User Pool Client',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: identityPool.ref,
      description: 'ID of the Cognito Identity Pool',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'Endpoint URL of the API Gateway',
    });

    new cdk.CfnOutput(this, 'FileStorageBucket', {
      value: fileStorageBucket.bucketName,
      description: 'Name of the S3 bucket for file storage',
    });

    new cdk.CfnOutput(this, 'WebsiteBucket', {
      value: websiteBucket.bucketName,
      description: 'Name of the S3 bucket for website hosting',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'Domain name of the CloudFront distribution',
    });

    if (certificateArn) {
      new cdk.CfnOutput(this, 'WebsiteDomain', {
        value: `https://${domainName}`,
        description: 'Website domain with custom domain',
      });
    }
  }
}