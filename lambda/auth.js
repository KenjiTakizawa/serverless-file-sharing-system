const AWS = require('aws-sdk');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// AWSサービスのインスタンス化
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES({ region: process.env.AWS_REGION });
const s3 = new AWS.S3();

// 許可されたIPアドレスのリスト（環境変数から取得）
const ALLOWED_IP_ADDRESSES = JSON.parse(process.env.ALLOWED_IP_ADDRESSES || '[]');

// Cognitoの設定
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

// DynamoDBテーブル名
const USERS_TABLE = process.env.USERS_TABLE;
const ACCESS_LOGS_TABLE = process.env.ACCESS_LOGS_TABLE;

/**
 * IPアドレスが許可リストに含まれているか確認
 * @param {string} ipAddress - チェックするIPアドレス
 * @returns {boolean} - 許可されているかどうか
 */
function isIpAllowed(ipAddress) {
  if (!ALLOWED_IP_ADDRESSES.length) return true; // 設定がなければデフォルトで許可

  // CIDRブロックのチェック
  return ALLOWED_IP_ADDRESSES.some(allowedIp => {
    if (allowedIp.includes('/')) {
      // CIDRブロックの場合
      const [subnet, mask] = allowedIp.split('/');
      const ipLong = ipToLong(ipAddress);
      const subnetLong = ipToLong(subnet);
      const maskLong = (0xffffffff << (32 - parseInt(mask))) >>> 0;
      return (ipLong & maskLong) === (subnetLong & maskLong);
    } else {
      // 単一IPの場合
      return ipAddress === allowedIp;
    }
  });
}

/**
 * IPアドレスを数値に変換
 * @param {string} ip - IPアドレス
 * @returns {number} - 数値形式のIPアドレス
 */
function ipToLong(ip) {
  return ip.split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * アクセスログを記録
 * @param {Object} logData - ログデータ
 */
async function logAccess(logData) {
  const timestamp = new Date().toISOString();
  const logId = uuidv4();
  
  try {
    await dynamoDB.put({
      TableName: ACCESS_LOGS_TABLE,
      Item: {
        logId,
        timestamp,
        ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90, // 90日後にログを自動削除
        ...logData
      }
    }).promise();
  } catch (error) {
    console.error('Error logging access:', error);
    // ログ記録のエラーはシステム動作に影響させない
  }
}

/**
 * ユーザーログイン処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleLogin(event, context) {
  const body = JSON.parse(event.body);
  const { email, password } = body;
  const sourceIp = event.requestContext.identity.sourceIp;
  
  // IPアドレス制限チェック
  if (!isIpAllowed(sourceIp)) {
    await logAccess({
      action: 'LOGIN',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: false,
      reason: 'IP_NOT_ALLOWED'
    });
    
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: '許可されていないIPアドレスからのアクセスです。'
      })
    };
  }
  
  try {
    // Cognitoでユーザー認証
    const authParams = {
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      ClientId: USER_POOL_CLIENT_ID,
      UserPoolId: USER_POOL_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };
    
    const authResponse = await cognitoIdentityServiceProvider.adminInitiateAuth(authParams).promise();
    
    // 認証成功のログ記録
    await logAccess({
      action: 'LOGIN',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: true
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ログイン成功',
        token: authResponse.AuthenticationResult.IdToken,
        refreshToken: authResponse.AuthenticationResult.RefreshToken,
        expiresIn: authResponse.AuthenticationResult.ExpiresIn
      })
    };
  } catch (error) {
    console.error('Login error:', error);
    
    // 認証失敗のログ記録
    await logAccess({
      action: 'LOGIN',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: false,
      reason: error.code || 'UNKNOWN_ERROR'
    });
    
    let message = 'ログインに失敗しました。';
    if (error.code === 'NotAuthorizedException') {
      message = 'メールアドレスまたはパスワードが正しくありません。';
    } else if (error.code === 'UserNotFoundException') {
      message = 'メールアドレスまたはパスワードが正しくありません。';
    }
    
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message })
    };
  }
}

/**
 * パスワードリセット要求処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleRequestPasswordReset(event, context) {
  const body = JSON.parse(event.body);
  const { email } = body;
  const sourceIp = event.requestContext.identity.sourceIp;
  
  try {
    // ユーザーの存在確認
    try {
      await cognitoIdentityServiceProvider.adminGetUser({
        UserPoolId: USER_POOL_ID,
        Username: email
      }).promise();
    } catch (error) {
      if (error.code === 'UserNotFoundException') {
        // ユーザーが存在しない場合もリクエスト成功と返す（セキュリティ上の理由）
        await logAccess({
          action: 'PASSWORD_RESET_REQUEST',
          email,
          ipAddress: sourceIp,
          userAgent: event.headers['User-Agent'],
          isSuccess: false,
          reason: 'USER_NOT_FOUND'
        });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: 'パスワードリセット用のコードを送信しました。メールをご確認ください。'
          })
        };
      }
      throw error;
    }
    
    // パスワードリセットコード送信
    await cognitoIdentityServiceProvider.adminResetUserPassword({
      UserPoolId: USER_POOL_ID,
      Username: email
    }).promise();
    
    // リクエスト成功のログ記録
    await logAccess({
      action: 'PASSWORD_RESET_REQUEST',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: true
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'パスワードリセット用のコードを送信しました。メールをご確認ください。'
      })
    };
  } catch (error) {
    console.error('Password reset request error:', error);
    
    // リクエスト失敗のログ記録
    await logAccess({
      action: 'PASSWORD_RESET_REQUEST',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: false,
      reason: error.code || 'UNKNOWN_ERROR'
    });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'パスワードリセット処理に失敗しました。後ほど再度お試しください。'
      })
    };
  }
}

/**
 * パスワードリセット確認処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleConfirmPasswordReset(event, context) {
  const body = JSON.parse(event.body);
  const { email, confirmationCode, newPassword } = body;
  const sourceIp = event.requestContext.identity.sourceIp;
  
  // パスワード複雑性チェック
  if (!validatePasswordComplexity(newPassword)) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'パスワードは12文字以上で、大文字、小文字、数字、記号をすべて含める必要があります。'
      })
    };
  }
  
  try {
    // パスワードリセット確認
    await cognitoIdentityServiceProvider.confirmForgotPassword({
      ClientId: USER_POOL_CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    }).promise();
    
    // リセット成功のログ記録
    await logAccess({
      action: 'PASSWORD_RESET_CONFIRM',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: true
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'パスワードのリセットが完了しました。新しいパスワードでログインしてください。'
      })
    };
  } catch (error) {
    console.error('Password reset confirmation error:', error);
    
    // リセット失敗のログ記録
    await logAccess({
      action: 'PASSWORD_RESET_CONFIRM',
      email,
      ipAddress: sourceIp,
      userAgent: event.headers['User-Agent'],
      isSuccess: false,
      reason: error.code || 'UNKNOWN_ERROR'
    });
    
    let message = 'パスワードリセットに失敗しました。';
    if (error.code === 'CodeMismatchException') {
      message = '確認コードが正しくありません。';
    } else if (error.code === 'ExpiredCodeException') {
      message = '確認コードの有効期限が切れています。再度リセットをリクエストしてください。';
    }
    
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message })
    };
  }
}

/**
 * パスワードの複雑性をチェック
 * @param {string} password - チェックするパスワード
 * @returns {boolean} - 有効なパスワードかどうか
 */
function validatePasswordComplexity(password) {
  if (password.length < 12) return false;
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const validCategories = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars]
    .filter(Boolean).length;
  
  return validCategories >= 4;
}

// エクスポート
module.exports = {
  handleLogin,
  handleRequestPasswordReset,
  handleConfirmPasswordReset
};