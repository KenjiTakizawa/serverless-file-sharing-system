// lambda/accessControl.js
const AWS = require('aws-sdk');
const crypto = require('crypto');

// AWSサービスのインスタンス化
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// 環境変数からテーブル名を取得
const FILE_GROUPS_TABLE = process.env.FILE_GROUPS_TABLE;
const ACCESS_PERMISSIONS_TABLE = process.env.ACCESS_PERMISSIONS_TABLE;
const ACCESS_ATTEMPTS_TABLE = process.env.ACCESS_ATTEMPTS_TABLE;
const IP_RESTRICTIONS_TABLE = process.env.IP_RESTRICTIONS_TABLE || 'ip-restrictions';
const ACCESS_LOGS_TABLE = process.env.ACCESS_LOGS_TABLE || 'file-access-logs';

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
    
    // IPアドレス制限のチェック
    const ipRestrictionResult = await checkIpRestriction(groupId, ipAddress);
    if (!ipRestrictionResult.allowed) {
      return {
        success: false,
        message: 'このIPアドレスからのアクセスは許可されていません',
        remainingAttempts: MAX_LOGIN_ATTEMPTS
      };
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

/**
 * IPアドレス制限をチェック
 * @param {string} groupId - ファイルグループID
 * @param {string} ipAddress - クライアントIPアドレス
 * @returns {Object} - IPアドレス制限の結果
 */
async function checkIpRestriction(groupId, ipAddress) {
  try {
    // ファイルグループのアクセス権限情報を取得
    const groupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId
      }
    };
    
    const groupResult = await dynamoDB.get(groupParams).promise();
    const group = groupResult.Item;
    
    if (!group || !group.accessPermissionId) {
      return { allowed: true }; // 制限情報がなければデフォルトで許可
    }
    
    // IPアドレス制限情報を取得
    const ipParams = {
      TableName: IP_RESTRICTIONS_TABLE,
      Key: {
        permissionId: group.accessPermissionId
      }
    };
    
    const ipResult = await dynamoDB.get(ipParams).promise();
    const ipRestrictions = ipResult.Item;
    
    // 制限がない場合は許可
    if (!ipRestrictions || !ipRestrictions.enabled) {
      return { allowed: true };
    }
    
    // 許可IPリストが空の場合は許可
    if (!ipRestrictions.allowedIps || ipRestrictions.allowedIps.length === 0) {
      return { allowed: true };
    }
    
    // IPアドレスがリスト内にあるか確認
    const isAllowed = ipRestrictions.allowedIps.some(allowedIp => {
      // 完全一致
      if (allowedIp === ipAddress) {
        return true;
      }
      
      // CIDRブロックでの一致チェック
      if (allowedIp.includes('/')) {
        return isIpInCidr(ipAddress, allowedIp);
      }
      
      // ワイルドカード（*）での一致チェック
      if (allowedIp.includes('*')) {
        const pattern = allowedIp.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}// lambda/accessControl.js
const AWS = require('aws-sdk');
const crypto = require('crypto');

// AWSサービスのインスタンス化
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// 環境変数からテーブル名を取得
const FILE_GROUPS_TABLE = process.env.FILE_GROUPS_TABLE;
const ACCESS_PERMISSIONS_TABLE = process.env.ACCESS_PERMISSIONS_TABLE;
const ACCESS_ATTEMPTS_TABLE = process.env.ACCESS_ATTEMPTS_TABLE;
const IP_RESTRICTIONS_TABLE = process.env.IP_RESTRICTIONS_TABLE || 'ip-restrictions';

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
    
    // IPアドレス制限のチェック
    const ipRestrictionResult = await checkIpRestriction(groupId, ipAddress);
    if (!ipRestrictionResult.allowed) {
      return {
        success: false,
        message: 'このIPアドレスからのアクセスは許可されていません',
        remainingAttempts: MAX_LOGIN_ATTEMPTS
      };
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

);
        return regex.test(ipAddress);
      }
      
      return false;
    });
    
    return { allowed: isAllowed };
  } catch (error) {
    console.error('Error checking IP restriction:', error);
    // エラーが発生した場合はデフォルトで許可（エラーを理由にアクセスを拒否したくない）
    return { allowed: true };
  }
}

/**
 * IPアドレスがCIDRブロック内にあるかを確認
 * @param {string} ip - チェックするIPアドレス
 * @param {string} cidr - CIDRブロック（例：192.168.1.0/24）
 * @returns {boolean} - CIDRブロック内にある場合はtrue
 */
function isIpInCidr(ip, cidr) {
  try {
    const [subnet, bits] = cidr.split('/');
    const ipNum = ip2long(ip);
    const netNum = ip2long(subnet);
    const mask = -1 << (32 - parseInt(bits));
    
    return (ipNum & mask) === (netNum & mask);
  } catch (error) {
    console.error('Error in CIDR check:', error);
    return false;
  }
}

/**
 * IPアドレスを数値に変換
 * @param {string} ip - IPアドレス
 * @returns {number} - 数値表現
 */
function ip2long(ip) {
  const parts = ip.split('.');
  let result = 0;
  
  for (let i = 0; i < 4; i++) {
    result = result * 256 + parseInt(parts[i], 10);
  }
  
  return result >>> 0; // 符号なし32ビット整数に変換
}

/**
 * IP制限を更新
 * @param {string} permissionId - アクセス権限ID
 * @param {Object} ipRestrictions - IP制限設定
 * @returns {Object} - 更新結果
 */
async function updateIpRestrictions(permissionId, ipRestrictions) {
  try {
    const params = {
      TableName: IP_RESTRICTIONS_TABLE,
      Item: {
        permissionId,
        enabled: ipRestrictions.enabled || false,
        allowedIps: ipRestrictions.allowedIps || [],
        updatedAt: new Date().toISOString()
      }
    };
    
    await dynamoDB.put(params).promise();
    
    return {
      success: true,
      message: 'IP制限設定が更新されました'
    };
  } catch (error) {
    console.error('Error updating IP restrictions:', error);
    throw error;
  }
}

/**
 * アクセスログを記録する関数
 * @param {string} groupId - ファイルグループID
 * @param {string} fileId - ファイルID（該当する場合）
 * @param {string} userId - ユーザーID（認証されている場合）
 * @param {string} ipAddress - アクセス元IPアドレス
 * @param {string} action - アクション（例：'download', 'view', 'verify'）
 * @param {Object} metadata - 追加のメタデータ
 * @returns {Promise<Object>} - 記録されたログエントリ
 */
async function recordAccessLog(groupId, fileId, userId, ipAddress, action, metadata = {}) {
  try {
    const now = new Date();
    const logId = `${groupId}:${now.getTime()}:${Math.random().toString(36).substring(2, 15)}`;
    
    const logEntry = {
      logId,
      groupId,
      timestamp: now.toISOString(),
      ipAddress: ipAddress || 'unknown',
      userId: userId || 'anonymous',
      action: action || 'access',
      ...metadata
    };
    
    // fileIdが指定されている場合は追加
    if (fileId) {
      logEntry.fileId = fileId;
    }
    
    // DynamoDBにログを保存
    const params = {
      TableName: ACCESS_LOGS_TABLE,
      Item: logEntry
    };
    
    await dynamoDB.put(params).promise();
    
    return logEntry;
  } catch (error) {
    console.error('Error recording access log:', error);
    // ログ記録のエラーはスローせず、静かに失敗する
    return null;
  }
}

/**
 * ファイルグループのアクセスログを取得する関数
 * @param {string} groupId - ファイルグループID
 * @param {number} limit - 取得するログの最大数
 * @param {string} startKey - ページネーションの開始キー
 * @returns {Promise<Object>} - ログエントリと次のページキー
 */
async function getAccessLogs(groupId, limit = 50, startKey = null) {
  try {
    const params = {
      TableName: ACCESS_LOGS_TABLE,
      IndexName: 'GroupIdIndex', // GroupIdによるインデックス（DynamoDBで作成する必要あり）
      KeyConditionExpression: 'groupId = :groupId',
      ExpressionAttributeValues: {
        ':groupId': groupId
      },
      ScanIndexForward: false, // 降順（最新のログを先に取得）
      Limit: limit
    };
    
    // ページネーションがある場合
    if (startKey) {
      params.ExclusiveStartKey = JSON.parse(Buffer.from(startKey, 'base64').toString());
    }
    
    const result = await dynamoDB.query(params).promise();
    
    // 次のページキーがある場合はエンコード
    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }
    
    return {
      logs: result.Items,
      nextKey
    };
  } catch (error) {
    console.error('Error getting access logs:', error);
    throw error;
  }
}

/**
 * 特定期間のアクセスログをエクスポートする関数
 * @param {string} groupId - ファイルグループID
 * @param {string} startDate - 開始日（ISO 8601形式）
 * @param {string} endDate - 終了日（ISO 8601形式）
 * @returns {Promise<Array>} - ログエントリの配列
 */
async function exportAccessLogs(groupId, startDate, endDate) {
  try {
    // 日付の検証
    const start = startDate ? new Date(startDate) : new Date(0); // 開始日が指定されていない場合はエポック時間
    const end = endDate ? new Date(endDate) : new Date(); // 終了日が指定されていない場合は現在時刻
    
    // フォーマットされた日付文字列
    const startDateStr = start.toISOString();
    const endDateStr = end.toISOString();
    
    const logs = [];
    let lastEvaluatedKey = null;
    
    // ページネーションを使用して全ログを取得
    do {
      const params = {
        TableName: ACCESS_LOGS_TABLE,
        IndexName: 'GroupIdIndex',
        KeyConditionExpression: 'groupId = :groupId AND #ts BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#ts': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':groupId': groupId,
          ':start': startDateStr,
          ':end': endDateStr
        },
        Limit: 1000 // 一度に取得する最大数
      };
      
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const result = await dynamoDB.query(params).promise();
      logs.push(...result.Items);
      
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return logs;
  } catch (error) {
    console.error('Error exporting access logs:', error);
    throw error;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyFileAccess,
  createPasswordProtection,
  checkIpRestriction,
  updateIpRestrictions,
  recordAccessLog,
  getAccessLogs,
  exportAccessLogs
};
