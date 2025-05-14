// lambda/accessControl.js
const AWS = require('aws-sdk');
const crypto = require('crypto');

// AWSサービスのインスタンス化
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// 環境変数からテーブル名を取得
const FILE_GROUPS_TABLE = process.env.FILE_GROUPS_TABLE;
const ACCESS_PERMISSIONS_TABLE = process.env.ACCESS_PERMISSIONS_TABLE;
const ACCESS_ATTEMPTS_TABLE = process.env.ACCESS_ATTEMPTS_TABLE;

// 認証関連の設定
const MAX_LOGIN_ATTEMPTS = 5; // 最大試行回数
const LOCKOUT_DURATION = 30 * 60 * 1000; // ロックアウト時間（ミリ秒）: 30分
const ATTEMPT_EXPIRY = 24 * 60 * 60 * 1000; // 認証試行の記録保持時間（ミリ秒）: 24時間

/**
 * パスワードハッシュの生成
 * @param {string} password - 平文パスワード
 * @param {string} salt - ソルト値（未指定の場合は新規生成）
 * @returns {Object} - ハッシュ化されたパスワードとソルト
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    // ソルトが指定されていない場合は新規生成
    salt = crypto.randomBytes(16).toString('hex');
  }
  
  // PBKDF2でパスワードをハッシュ化（安全なハッシュ化方式）
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  
  return {
    hash,
    salt
  };
}

/**
 * パスワードの検証
 * @param {string} password - 検証する平文パスワード
 * @param {string} hash - 保存されているハッシュ値
 * @param {string} salt - 保存されているソルト値
 * @returns {boolean} - パスワードが一致すればtrue
 */
function verifyPassword(password, hash, salt) {
  const hashVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === hashVerify;
}

/**
 * 認証失敗の試行回数を記録
 * @param {string} groupId - ファイルグループID
 * @param {string} ipAddress - クライアントのIPアドレス
 * @returns {Object} - 現在の試行状況（回数、ロック状態など）
 */
async function recordFailedAttempt(groupId, ipAddress) {
  const now = new Date();
  const attemptId = `${groupId}:${ipAddress}`;
  
  try {
    // 現在の試行記録を取得
    const params = {
      TableName: ACCESS_ATTEMPTS_TABLE,
      Key: {
        attemptId
      }
    };
    
    const result = await dynamoDB.get(params).promise();
    let currentAttempt = result.Item;
    
    // 記録が存在しない場合は新規作成
    if (!currentAttempt) {
      currentAttempt = {
        attemptId,
        groupId,
        ipAddress,
        attemptCount: 0,
        firstAttempt: now.toISOString(),
        lastAttempt: now.toISOString(),
        isLocked: false,
        lockExpiry: null
      };
    }
    
    // 試行回数を増やす
    currentAttempt.attemptCount += 1;
    currentAttempt.lastAttempt = now.toISOString();
    
    // 最大試行回数を超えた場合はロック
    if (currentAttempt.attemptCount >= MAX_LOGIN_ATTEMPTS && !currentAttempt.isLocked) {
      const lockExpiry = new Date(now.getTime() + LOCKOUT_DURATION);
      currentAttempt.isLocked = true;
      currentAttempt.lockExpiry = lockExpiry.toISOString();
    }
    
    // 更新した試行記録を保存
    const updateParams = {
      TableName: ACCESS_ATTEMPTS_TABLE,
      Item: currentAttempt
    };
    
    await dynamoDB.put(updateParams).promise();
    
    return currentAttempt;
  } catch (error) {
    console.error('Error recording failed attempt:', error);
    throw error;
  }
}

/**
 * 認証試行記録をリセット（成功時）
 * @param {string} groupId - ファイルグループID
 * @param {string} ipAddress - クライアントのIPアドレス
 */
async function resetAttempts(groupId, ipAddress) {
  const attemptId = `${groupId}:${ipAddress}`;
  
  try {
    // 試行記録を削除
    const params = {
      TableName: ACCESS_ATTEMPTS_TABLE,
      Key: {
        attemptId
      }
    };
    
    await dynamoDB.delete(params).promise();
  } catch (error) {
    console.error('Error resetting attempts:', error);
    // この失敗は認証自体には影響しないのでスルー
  }
}

/**
 * ファイルアクセス権限を検証
 * @param {string} groupId - ファイルグループID
 * @param {string} password - 入力されたパスワード
 * @param {string} ipAddress - クライアントのIPアドレス
 * @returns {Object} - 検証結果
 */
async function verifyFileAccess(groupId, password, ipAddress) {
  try {
    // まず、ロック状態をチェック
    const attemptId = `${groupId}:${ipAddress}`;
    const attemptParams = {
      TableName: ACCESS_ATTEMPTS_TABLE,
      Key: {
        attemptId
      }
    };
    
    const attemptResult = await dynamoDB.get(attemptParams).promise();
    const attempt = attemptResult.Item;
    
    // ロックされているかチェック
    if (attempt && attempt.isLocked) {
      const lockExpiry = new Date(attempt.lockExpiry);
      const now = new Date();
      
      // ロック期間が終了しているかチェック
      if (now < lockExpiry) {
        return {
          success: false,
          message: 'アクセスがロックされています',
          lockExpiry: attempt.lockExpiry,
          remainingAttempts: 0,
          isLocked: true
        };
      } else {
        // ロック期間が終了している場合はリセット
        await resetAttempts(groupId, ipAddress);
      }
    }
    
    // ファイルグループ情報を取得
    const groupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId
      }
    };
    
    const groupResult = await dynamoDB.get(groupParams).promise();
    const group = groupResult.Item;
    
    if (!group) {
      return {
        success: false,
        message: 'ファイルグループが見つかりません',
        remainingAttempts: MAX_LOGIN_ATTEMPTS
      };
    }
    
    // グループがパスワード保護されているか確認
    if (!group.isPasswordProtected) {
      return {
        success: true,
        message: 'パスワード保護されていません',
        groupInfo: {
          groupId: group.groupId,
          expirationDate: group.expirationDate
        }
      };
    }
    
    // アクセス権限情報を取得
    const accessParams = {
      TableName: ACCESS_PERMISSIONS_TABLE,
      Key: {
        permissionId: group.accessPermissionId
      }
    };
    
    const accessResult = await dynamoDB.get(accessParams).promise();
    const accessInfo = accessResult.Item;
    
    if (!accessInfo) {
      return {
        success: false,
        message: 'アクセス権限情報が見つかりません',
        remainingAttempts: MAX_LOGIN_ATTEMPTS
      };
    }
    
    // 期限切れかチェック
    const expirationDate = new Date(accessInfo.expirationDate);
    const now = new Date();
    
    if (now > expirationDate) {
      return {
        success: false,
        message: 'このリンクは有効期限が切れています',
        remainingAttempts: MAX_LOGIN_ATTEMPTS
      };
    }
    
    // パスワードの検証
    if (!password) {
      return {
        success: false,
        message: 'パスワードが必要です',
        remainingAttempts: attempt ? MAX_LOGIN_ATTEMPTS - attempt.attemptCount : MAX_LOGIN_ATTEMPTS
      };
    }
    
    // 新しい形式のハッシュ＋ソルト方式を使用している場合
    if (accessInfo.passwordHash && accessInfo.passwordSalt) {
      const isValid = verifyPassword(password, accessInfo.passwordHash, accessInfo.passwordSalt);
      
      if (isValid) {
        // 認証成功
        await resetAttempts(groupId, ipAddress);
        
        return {
          success: true,
          message: 'アクセスが許可されました',
          groupInfo: {
            groupId: group.groupId,
            expirationDate: group.expirationDate
          }
        };
      }
    } 
    // 旧式のBase64エンコードを使用している場合（互換性のため）
    else if (accessInfo.passwordHash) {
      const oldStyleHash = Buffer.from(password).toString('base64');
      
      if (oldStyleHash === accessInfo.passwordHash) {
        // 認証成功
        await resetAttempts(groupId, ipAddress);
        
        // 旧式のハッシュを新しい安全な形式に更新（オプション）
        // この処理はバックグラウンドで行い、ユーザー体験に影響しないようにする
        try {
          const { hash, salt } = hashPassword(password);
          
          const updateParams = {
            TableName: ACCESS_PERMISSIONS_TABLE,
            Key: {
              permissionId: accessInfo.permissionId
            },
            UpdateExpression: 'set passwordHash = :hash, passwordSalt = :salt',
            ExpressionAttributeValues: {
              ':hash': hash,
              ':salt': salt
            }
          };
          
          await dynamoDB.update(updateParams).promise();
          console.log(`Updated password hash for group ${groupId} to secure format`);
        } catch (updateError) {
          console.error('Error updating password hash format:', updateError);
          // 更新に失敗してもユーザー認証には影響しないのでスルー
        }
        
        return {
          success: true,
          message: 'アクセスが許可されました',
          groupInfo: {
            groupId: group.groupId,
            expirationDate: group.expirationDate
          }
        };
      }
    }
    
    // ここまで来たら認証失敗
    const failedAttempt = await recordFailedAttempt(groupId, ipAddress);
    
    return {
      success: false,
      message: 'パスワードが正しくありません',
      remainingAttempts: MAX_LOGIN_ATTEMPTS - failedAttempt.attemptCount,
      isLocked: failedAttempt.isLocked,
      lockExpiry: failedAttempt.lockExpiry
    };
    
  } catch (error) {
    console.error('Error verifying file access:', error);
    throw error;
  }
}

/**
 * 新しいファイルグループのパスワード保護設定を作成
 * @param {string} password - 設定するパスワード
 * @returns {Object} - ハッシュ化されたパスワード情報
 */
function createPasswordProtection(password) {
  if (!password) {
    return {
      isPasswordProtected: false,
      passwordHash: null,
      passwordSalt: null
    };
  }
  
  const { hash, salt } = hashPassword(password);
  
  return {
    isPasswordProtected: true,
    passwordHash: hash,
    passwordSalt: salt
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyFileAccess,
  createPasswordProtection
};
