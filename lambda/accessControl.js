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

// 定数の定義
const DEFAULT_LOG_LIMIT = 50; // デフォルトのログ取得件数
const MAX_LOG_LIMIT = 1000; // 最大ログ取得件数

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
  
  // タイミング攻撃に対する防御として、定数時間で比較するようにします
  // crypto.timingSafeEqualを使用してハッシュを比較
  const hashBuffer = Buffer.from(hash, 'hex');
  const hashVerifyBuffer = Buffer.from(hashVerify, 'hex');
  
  try {
    return crypto.timingSafeEqual(hashBuffer, hashVerifyBuffer);
  } catch (error) {
    console.error('Error comparing password hashes:', error);
    return false;
  }
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
        const regex = new RegExp(`^${pattern}$`);
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
 * IP制限を更新
 * @param {string} permissionId - アクセス権限ID
 * @param {Object} ipRestrictions - IP制限設定
 * @returns {Object} - 更新結果
 */
async function updateIpRestrictions(permissionId, ipRestrictions) {
  try {
    // IPアドレスの形式のバリデーション
    let validatedIps = [];
    
    if (ipRestrictions.allowedIps && Array.isArray(ipRestrictions.allowedIps)) {
      // 各IPアドレスを検証
      for (const ip of ipRestrictions.allowedIps) {
        if (typeof ip !== 'string') continue;
        
        // CIDR形式のチェック (192.168.1.0/24 など)
        if (ip.includes('/')) {
          const [ipPart, cidrPart] = ip.split('/');
          const cidrNum = parseInt(cidrPart, 10);
          
          // IP部分が有効で、CIDRプレフィックスが0～32の範囲内かチェック
          if (validateIpFormat(ipPart) && !isNaN(cidrNum) && cidrNum >= 0 && cidrNum <= 32) {
            validatedIps.push(ip);
          }
          continue;
        }
        
        // ワイルドカードを含むIP形式のチェック (192.168.*.* など)
        if (ip.includes('*')) {
          const ipParts = ip.split('.');
          
          // IPv4でオクテットが4つあることを確認
          if (ipParts.length === 4) {
            // 各オクテットが番号または*か確認
            const isValid = ipParts.every(part => part === '*' || (/^\d+$/.test(part) && parseInt(part, 10) >= 0 && parseInt(part, 10) <= 255));
            
            if (isValid) {
              validatedIps.push(ip);
            }
          }
          continue;
        }
        
        // 標準的なIPv4/IPv6チェック
        if (validateIpFormat(ip)) {
          validatedIps.push(ip);
        }
      }
    }
    
    // 重複を除外
    validatedIps = [...new Set(validatedIps)];
    
    // 最大IP制限数
    const MAX_IP_RESTRICTIONS = 100;
    if (validatedIps.length > MAX_IP_RESTRICTIONS) {
      validatedIps = validatedIps.slice(0, MAX_IP_RESTRICTIONS);
    }
    
    const params = {
      TableName: IP_RESTRICTIONS_TABLE,
      Item: {
        permissionId,
        enabled: ipRestrictions.enabled === true, // 明示的に真偽値に変換
        allowedIps: validatedIps,
        updatedAt: new Date().toISOString()
      }
    };
    
    await dynamoDB.put(params).promise();
    
    return {
      success: true,
      message: 'IP制限設定が更新されました',
      allowedIps: validatedIps
    };
  } catch (error) {
    console.error('Error updating IP restrictions:', error);
    throw error;
  }
}

/**
 * IPアドレスの形式が有効かチェックする関数
 * @param {string} ip - チェックするIPアドレス
 * @returns {boolean} - 有効なフォーマットならtrue
 */
function validateIpFormat(ip) {
  // IPv4の検証
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4Pattern.test(ip)) {
    // 各オクテットが0-255の範囲内かチェック
    const parts = ip.split('.');
    return parts.every(part => parseInt(part, 10) >= 0 && parseInt(part, 10) <= 255);
  }
  
  // IPv6の検証 (簡易的なチェック)
  const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;
  return ipv6Pattern.test(ip);
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
    // UUIDを使用したlogIdの生成 (予測不能な値にする)
    const randomId = crypto.randomBytes(16).toString('hex');
    const logId = `${groupId}:${now.getTime()}:${randomId}`;
    
    // IPアドレスの部分的なマスキング (プライバシー保護)
    let maskedIp = ipAddress || 'unknown';
    if (maskedIp !== 'unknown' && maskedIp.includes('.')) {
      // IPv4の場合は最後のオクテットをマスク
      const ipParts = maskedIp.split('.');
      ipParts[ipParts.length - 1] = 'xxx';
      maskedIp = ipParts.join('.');
    } else if (maskedIp !== 'unknown' && maskedIp.includes(':')) {
      // IPv6の場合は後半をマスク
      maskedIp = maskedIp.split(':').slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
    }
    
    // センシティブ情報をフィルタリング
    const sanitizedMetadata = { ...metadata };
    // パスワードなどのセンシティブ情報を削除
    if (sanitizedMetadata.password) delete sanitizedMetadata.password;
    if (sanitizedMetadata.passwordHash) delete sanitizedMetadata.passwordHash;
    if (sanitizedMetadata.passwordSalt) delete sanitizedMetadata.passwordSalt;
    if (sanitizedMetadata.token) delete sanitizedMetadata.token;
    
    const logEntry = {
      logId,
      groupId,
      timestamp: now.toISOString(),
      ipAddress: maskedIp,
      userId: userId || 'anonymous',
      action: action || 'access',
      ...sanitizedMetadata
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
async function getAccessLogs(groupId, limit = DEFAULT_LOG_LIMIT, startKey = null) {
  try {
    // リミットの検証と制限
    const validLimit = Math.min(Math.max(1, limit), MAX_LOG_LIMIT);
    
    const params = {
      TableName: ACCESS_LOGS_TABLE,
      IndexName: 'GroupIdIndex', // GroupIdによるインデックス（DynamoDBで作成する必要あり）
      KeyConditionExpression: 'groupId = :groupId',
      ExpressionAttributeValues: {
        ':groupId': groupId
      },
      ScanIndexForward: false, // 降順（最新のログを先に取得）
      Limit: validLimit
    };
    
    // ページネーションキーの検証と変換
    if (startKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(startKey, 'base64').toString());
      } catch (parseError) {
        console.error('Invalid start key format:', parseError);
        // エラーの場合は無視して最初から取得
      }
    }
    
    const result = await dynamoDB.query(params).promise();
    
    // センシティブ情報をフィルタリング
    const filteredLogs = result.Items.map(log => {
      const cleanedLog = { ...log };
      
      // センシティブと思われるキーを削除
      const sensitiveKeys = ['passwordHash', 'passwordSalt', 'token', 'credentials', 'secret'];
      sensitiveKeys.forEach(key => {
        if (cleanedLog[key]) delete cleanedLog[key];
      });
      
      return cleanedLog;
    });
    
    // 次のページキーがある場合はエンコード
    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }
    
    return {
      logs: filteredLogs,
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
    // 日付の検証とパラメータ化
    let start, end;
    
    try {
      start = startDate ? new Date(startDate) : new Date(0);
      if (isNaN(start.getTime())) {
        console.warn('Invalid start date provided, using epoch time instead');
        start = new Date(0); // 無効な日付の場合はエポック時間を使用
      }
    } catch (e) {
      console.warn('Error parsing start date:', e);
      start = new Date(0);
    }
    
    try {
      end = endDate ? new Date(endDate) : new Date();
      if (isNaN(end.getTime())) {
        console.warn('Invalid end date provided, using current time instead');
        end = new Date(); // 無効な日付の場合は現在時刻を使用
      }
    } catch (e) {
      console.warn('Error parsing end date:', e);
      end = new Date();
    }
    
    // フォーマットされた日付文字列
    const startDateStr = start.toISOString();
    const endDateStr = end.toISOString();
    
    const logs = [];
    let lastEvaluatedKey = null;
    const MAX_EXPORT_ITEMS = 10000; // エクスポートの最大数を制限
    let totalItems = 0;
    
    // ページネーションを使用して全ログを取得 (上限あり)
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
      
      // センシティブ情報をフィルタリング
      const filteredItems = result.Items.map(log => {
        const cleanedLog = { ...log };
        
        // センシティブと思われるキーを削除
        const sensitiveKeys = ['passwordHash', 'passwordSalt', 'token', 'credentials', 'secret'];
        sensitiveKeys.forEach(key => {
          if (cleanedLog[key]) delete cleanedLog[key];
        });
        
        return cleanedLog;
      });
      
      logs.push(...filteredItems);
      totalItems += filteredItems.length;
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      // 最大数に達した場合は終了
      if (totalItems >= MAX_EXPORT_ITEMS) {
        console.warn(`Export limit of ${MAX_EXPORT_ITEMS} items reached for groupId: ${groupId}`);
        break;
      }
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
