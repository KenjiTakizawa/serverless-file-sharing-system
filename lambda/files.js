// lambda/files.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const accessControl = require('./accessControl');

// AWSサービスのインスタンス化
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

// 定数定義
const UPLOAD_URL_EXPIRATION = 15 * 60; // アップロード用URL有効期間（秒）: 15分
const DOWNLOAD_URL_EXPIRATION = 60 * 60; // ダウンロード用URL有効期間（秒）: 1時間
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 最大ファイルサイズ: 100MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed'
];

// 環境変数からテーブル名などを取得
const FILE_STORAGE_BUCKET = process.env.FILE_STORAGE_BUCKET;
const FILE_GROUPS_TABLE = process.env.FILE_GROUPS_TABLE;
const FILES_TABLE = process.env.FILES_TABLE;
const ACCESS_PERMISSIONS_TABLE = process.env.ACCESS_PERMISSIONS_TABLE;

/**
 * ファイルグループの作成処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleCreateFileGroup(event, context) {
  const requestBody = JSON.parse(event.body);
  const { groupId, files, shareSettings } = requestBody;
  const userId = event.requestContext.authorizer.claims.sub; // Cognitoユーザーのサブ
  const email = event.requestContext.authorizer.claims.email;
  
  try {
    // 有効期限の計算
    const expirationDays = shareSettings.expirationDays || 7; // デフォルト7日
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setDate(now.getDate() + expirationDays);
    
    // 共有設定
    const accessPermissionId = uuidv4();
    const accessUrl = groupId; // 共有URLの一部として使用
    
    // パスワード保護の設定
    const passwordProtection = accessControl.createPasswordProtection(shareSettings.password);
    const isPasswordProtected = passwordProtection.isPasswordProtected;
    const passwordHash = passwordProtection.passwordHash;
    const passwordSalt = passwordProtection.passwordSalt;
    
    // ファイルグループの保存
    const fileGroupParams = {
      TableName: FILE_GROUPS_TABLE,
      Item: {
        groupId,
        userId,
        userEmail: email,
        createdAt: now.toISOString(),
        expirationDate: expirationDate.toISOString(),
        fileCount: files.length,
        totalSize: files.reduce((total, file) => total + parseInt(file.size), 0),
        isPasswordProtected: isPasswordProtected,
        accessPermissionId
      }
    };
    
    await dynamoDB.put(fileGroupParams).promise();
    
    // ファイルメタデータの保存
    const filePromises = files.map(file => {
      const fileParams = {
        TableName: FILES_TABLE,
        Item: {
          fileId: file.fileId,
          groupId,
          userId,
          key: file.key,
          originalName: file.name,
          size: file.size,
          contentType: file.type,
          createdAt: now.toISOString()
        }
      };
      
      return dynamoDB.put(fileParams).promise();
    });
    
    await Promise.all(filePromises);
    
    // アクセス権限の保存
    const accessPermissionsParams = {
      TableName: ACCESS_PERMISSIONS_TABLE,
      Item: {
        permissionId: accessPermissionId,
        groupId,
        accessUrl,
        passwordHash,
        passwordSalt,
        expirationDate: expirationDate.toISOString(),
        allowedEmails: shareSettings.allowedEmails || [],
        createdAt: now.toISOString(),
        createdBy: userId
      }
    };
    
    await dynamoDB.put(accessPermissionsParams).promise();
    
    // レスポンス
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        groupId,
        expirationDate: expirationDate.toISOString(),
        shareUrl: `${event.headers.origin || 'https://example.com'}/share/${accessUrl}`
      })
    };
    
  } catch (error) {
    console.error('Error creating file group:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ファイルグループの作成に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * ファイルグループ一覧の取得処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleGetFileGroups(event, context) {
  const userId = event.requestContext.authorizer.claims.sub;
  const includeExpired = event.queryStringParameters?.includeExpired === 'true';
  
  try {
    // ユーザーのファイルグループを取得
    const params = {
      TableName: FILE_GROUPS_TABLE,
      IndexName: 'UserIdIndex', // ユーザーIDによるインデックス
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };
    
    const result = await dynamoDB.query(params).promise();
    let fileGroups = result.Items || [];
    
    // 期限切れのファイルを除外（includeExpiredがfalseの場合）
    if (!includeExpired) {
      const now = new Date().toISOString();
      fileGroups = fileGroups.filter(group => group.expirationDate > now);
    }
    
    // レスポンス用データを整形
    const formattedGroups = await Promise.all(fileGroups.map(async (group) => {
      // アクセス権限情報を取得
      const accessParams = {
        TableName: ACCESS_PERMISSIONS_TABLE,
        Key: {
          permissionId: group.accessPermissionId
        }
      };
      
      const accessResult = await dynamoDB.get(accessParams).promise();
      const accessInfo = accessResult.Item || {};
      
      return {
        groupId: group.groupId,
        createdAt: group.createdAt,
        expirationDate: group.expirationDate,
        fileCount: group.fileCount,
        totalSize: group.totalSize,
        isPasswordProtected: group.isPasswordProtected,
        shareUrl: `${event.headers.origin || 'https://example.com'}/share/${accessInfo.accessUrl || group.groupId}`
      };
    }));
    
    // レスポンス
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        fileGroups: formattedGroups
      })
    };
    
  } catch (error) {
    console.error('Error getting file groups:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ファイルグループの取得に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * ファイルグループの詳細取得処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleGetFileGroupDetails(event, context) {
  const userId = event.requestContext.authorizer.claims.sub;
  const groupId = event.pathParameters.groupId;
  
  try {
    // ファイルグループの情報を取得
    const groupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId
      }
    };
    
    const groupResult = await dynamoDB.get(groupParams).promise();
    const group = groupResult.Item;
    
    // グループが存在しないか、ユーザーが所有者でない場合はエラー
    if (!group || group.userId !== userId) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'ファイルグループが見つかりません'
        })
      };
    }
    
    // グループに属するファイルを取得
    const filesParams = {
      TableName: FILES_TABLE,
      IndexName: 'GroupIdIndex',
      KeyConditionExpression: 'groupId = :groupId',
      ExpressionAttributeValues: {
        ':groupId': groupId
      }
    };
    
    const filesResult = await dynamoDB.query(filesParams).promise();
    const files = filesResult.Items || [];
    
    // アクセス権限情報を取得
    const accessParams = {
      TableName: ACCESS_PERMISSIONS_TABLE,
      Key: {
        permissionId: group.accessPermissionId
      }
    };
    
    const accessResult = await dynamoDB.get(accessParams).promise();
    const accessInfo = accessResult.Item || {};
    
    // レスポンス用データを整形
    const response = {
      groupId: group.groupId,
      createdAt: group.createdAt,
      expirationDate: group.expirationDate,
      fileCount: group.fileCount,
      totalSize: group.totalSize,
      isPasswordProtected: group.isPasswordProtected,
      files: files.map(file => ({
        fileId: file.fileId,
        key: file.key,
        name: file.originalName,
        size: file.size,
        type: file.contentType
      })),
      shareUrl: `${event.headers.origin || 'https://example.com'}/share/${accessInfo.accessUrl || group.groupId}`
    };
    
    // レスポンス
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };
    
  } catch (error) {
    console.error('Error getting file group details:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ファイルグループ詳細の取得に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * ファイルグループの削除処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleDeleteFileGroup(event, context) {
  const userId = event.requestContext.authorizer.claims.sub;
  const groupId = event.pathParameters.groupId;
  
  try {
    // ファイルグループの情報を取得
    const groupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId
      }
    };
    
    const groupResult = await dynamoDB.get(groupParams).promise();
    const group = groupResult.Item;
    
    // グループが存在しないか、ユーザーが所有者でない場合はエラー
    if (!group || group.userId !== userId) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'ファイルグループが見つかりません'
        })
      };
    }
    
    // グループに属するファイルを取得
    const filesParams = {
      TableName: FILES_TABLE,
      IndexName: 'GroupIdIndex',
      KeyConditionExpression: 'groupId = :groupId',
      ExpressionAttributeValues: {
        ':groupId': groupId
      }
    };
    
    const filesResult = await dynamoDB.query(filesParams).promise();
    const files = filesResult.Items || [];
    
    // S3からファイルを削除
    const deletePromises = files.map(file => {
      const params = {
        Bucket: FILE_STORAGE_BUCKET,
        Key: file.key
      };
      
      return s3.deleteObject(params).promise()
        .then(() => {
          // ファイルメタデータを削除
          const deleteParams = {
            TableName: FILES_TABLE,
            Key: {
              fileId: file.fileId
            }
          };
          
          return dynamoDB.delete(deleteParams).promise();
        });
    });
    
    await Promise.all(deletePromises);
    
    // アクセス権限を削除
    if (group.accessPermissionId) {
      const accessParams = {
        TableName: ACCESS_PERMISSIONS_TABLE,
        Key: {
          permissionId: group.accessPermissionId
        }
      };
      
      await dynamoDB.delete(accessParams).promise();
    }
    
    // ファイルグループを削除
    await dynamoDB.delete(groupParams).promise();
    
    // レスポンス
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ファイルグループが削除されました'
      })
    };
    
  } catch (error) {
    console.error('Error deleting file group:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ファイルグループの削除に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * 有効期限の更新処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleUpdateExpirationDate(event, context) {
  const userId = event.requestContext.authorizer.claims.sub;
  const groupId = event.pathParameters.groupId;
  const requestBody = JSON.parse(event.body);
  const expirationDays = requestBody.expirationDays || 7;
  
  try {
    // ファイルグループの情報を取得
    const groupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId
      }
    };
    
    const groupResult = await dynamoDB.get(groupParams).promise();
    const group = groupResult.Item;
    
    // グループが存在しないか、ユーザーが所有者でない場合はエラー
    if (!group || group.userId !== userId) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'ファイルグループが見つかりません'
        })
      };
    }
    
    // 有効期限の計算
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setDate(now.getDate() + expirationDays);
    
    // ファイルグループの有効期限を更新
    const updateGroupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId
      },
      UpdateExpression: 'set expirationDate = :expirationDate',
      ExpressionAttributeValues: {
        ':expirationDate': expirationDate.toISOString()
      },
      ReturnValues: 'UPDATED_NEW'
    };
    
    await dynamoDB.update(updateGroupParams).promise();
    
    // アクセス権限の有効期限も更新
    if (group.accessPermissionId) {
      const updateAccessParams = {
        TableName: ACCESS_PERMISSIONS_TABLE,
        Key: {
          permissionId: group.accessPermissionId
        },
        UpdateExpression: 'set expirationDate = :expirationDate',
        ExpressionAttributeValues: {
          ':expirationDate': expirationDate.toISOString()
        }
      };
      
      await dynamoDB.update(updateAccessParams).promise();
    }
    
    // レスポンス
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        groupId,
        expirationDate: expirationDate.toISOString()
      })
    };
    
  } catch (error) {
    console.error('Error updating expiration date:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: '有効期限の更新に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * アップロード用の署名付きURL生成処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleGenerateUploadUrls(event, context) {
  const userId = event.requestContext.authorizer.claims.sub;
  const requestBody = JSON.parse(event.body);
  const { files } = requestBody;
  
  // リクエストの検証
  if (!files || !Array.isArray(files) || files.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: '無効なリクエスト: filesは必須で少なくとも1つのファイル情報が必要です'
      })
    };
  }
  
  try {
    const urls = [];
    const now = new Date();
    
    for (const file of files) {
      // 必須フィールドの検証
      if (!file.name || !file.type || !file.size) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: '無効なファイル情報: name, type, sizeは必須です'
          })
        };
      }
      
      // ファイルサイズの制限
      if (parseInt(file.size) > MAX_FILE_SIZE) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: `ファイルサイズが制限を超えています: 最大${MAX_FILE_SIZE/(1024*1024)}MB`
          })
        };
      }
      
      // Content-Typeの検証
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: '非対応のファイル形式です',
            allowedTypes: ALLOWED_MIME_TYPES
          })
        };
      }
      
      // S3のキー（パス）を生成
      const fileId = uuidv4();
      const key = `${userId}/${fileId}/${file.name}`;
      
      // 署名付きURLの生成
      const params = {
        Bucket: FILE_STORAGE_BUCKET,
        Key: key,
        Expires: UPLOAD_URL_EXPIRATION,
        ContentType: file.type,
        // 追加のメタデータや制約を設定
        Metadata: {
          'original-filename': encodeURIComponent(file.name),
          'user-id': userId,
          'upload-date': now.toISOString()
        }
      };
      
      const uploadUrl = s3.getSignedUrl('putObject', params);
      
      urls.push({
        fileId,
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        uploadUrl
      });
    }
    
    // アクセスログの記録（オプション）
    // 実際の実装ではここでDynamoDBなどにログを残す処理を追加
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        urls,
        expiresIn: UPLOAD_URL_EXPIRATION
      })
    };
    
  } catch (error) {
    console.error('Error generating upload URLs:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'アップロード用URLの生成に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * ダウンロード用の署名付きURL生成処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleGenerateDownloadUrl(event, context) {
  const userId = event.requestContext.authorizer.claims.sub;
  const fileId = event.pathParameters.fileId;
  
  try {
    // ファイル情報をDynamoDBから取得
    const fileParams = {
      TableName: FILES_TABLE,
      Key: {
        fileId
      }
    };
    
    const fileResult = await dynamoDB.get(fileParams).promise();
    const file = fileResult.Item;
    
    if (!file) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'ファイルが見つかりません'
        })
      };
    }
    
    // ファイルグループ情報を取得してアクセス権限を確認
    const groupParams = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId: file.groupId
      }
    };
    
    const groupResult = await dynamoDB.get(groupParams).promise();
    const group = groupResult.Item;
    
    if (!group) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'ファイルグループが見つかりません'
        })
      };
    }
    
    // アクセス権限の確認
    // 1. ファイルの所有者か確認
    // 2. 共有設定に基づいたアクセス権限の確認
    if (file.userId !== userId && group.userId !== userId) {
      // ユーザーがファイルの所有者でない場合、共有の権限をチェック
      const accessParams = {
        TableName: ACCESS_PERMISSIONS_TABLE,
        Key: {
          permissionId: group.accessPermissionId
        }
      };
      
      const accessResult = await dynamoDB.get(accessParams).promise();
      const accessInfo = accessResult.Item;
      
      // アクセス権限が存在しない、または期限切れの場合はエラー
      if (!accessInfo || new Date(accessInfo.expirationDate) < new Date()) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: 'このファイルにアクセスする権限がありません'
          })
        };
      }
      
      // メールアドレスの制限がある場合はチェック
      if (accessInfo.allowedEmails && accessInfo.allowedEmails.length > 0) {
        const userEmail = event.requestContext.authorizer.claims.email;
        if (!accessInfo.allowedEmails.includes(userEmail)) {
          return {
            statusCode: 403,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              message: 'このファイルにアクセスする権限がありません'
            })
          };
        }
      }
    }
    
    // 署名付きURLの生成
    const params = {
      Bucket: FILE_STORAGE_BUCKET,
      Key: file.key,
      Expires: DOWNLOAD_URL_EXPIRATION,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.originalName)}"`,
      ResponseContentType: file.contentType
    };
    
    const downloadUrl = s3.getSignedUrl('getObject', params);
    
    // アクセスログの記録
    const logEntry = {
      fileId,
      userId: userId,
      accessTime: new Date().toISOString(),
      action: 'download',
      ipAddress: event.requestContext.identity?.sourceIp || 'unknown',
      userAgent: event.headers['User-Agent'] || 'unknown'
    };
    
    console.log('File access log:', JSON.stringify(logEntry));
    
    // 実際の実装ではDynamoDBにログを保存する処理を追加
    // 例: ACCESS_LOGS_TABLE などのテーブルに保存
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        fileId,
        fileName: file.originalName,
        contentType: file.contentType,
        size: file.size,
        downloadUrl,
        expiresIn: DOWNLOAD_URL_EXPIRATION
      })
    };
    
  } catch (error) {
    console.error('Error generating download URL:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ダウンロード用URLの生成に失敗しました',
        error: error.message
      })
    };
  }
}

/**
 * ファイルアクセスの検証処理
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - レスポンス
 */
async function handleVerifyFileAccess(event, context) {
  const groupId = event.pathParameters.groupId;
  const requestBody = JSON.parse(event.body);
  const { password } = requestBody;
  const ipAddress = event.requestContext.identity?.sourceIp || 'unknown';
  
  try {
    // パスワードの検証
    const verifyResult = await accessControl.verifyFileAccess(groupId, password, ipAddress);
    
    if (verifyResult.success) {
      // 認証成功
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          groupId: verifyResult.groupInfo.groupId,
          message: verifyResult.message,
          expirationDate: verifyResult.groupInfo.expirationDate
        })
      };
    } else {
      // 認証失敗
      const statusCode = verifyResult.isLocked ? 403 : 401;
      
      return {
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: verifyResult.message,
          remainingAttempts: verifyResult.remainingAttempts,
          isLocked: verifyResult.isLocked || false,
          lockExpiry: verifyResult.lockExpiry || null
        })
      };
    }
  } catch (error) {
    console.error('Error verifying file access:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'ファイルアクセスの検証に失敗しました',
        error: error.message
      })
    };
  }
}

module.exports = {
  handleCreateFileGroup,
  handleGetFileGroups,
  handleGetFileGroupDetails,
  handleDeleteFileGroup,
  handleUpdateExpirationDate,
  handleGenerateUploadUrls,
  handleGenerateDownloadUrl,
  handleVerifyFileAccess
};
