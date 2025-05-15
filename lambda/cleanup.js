// ファイルの自動削除を処理するLambda関数
const AWS = require('aws-sdk');

// AWSサービスのインスタンス化
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const sns = new AWS.SNS();
const cloudwatch = new AWS.CloudWatch();

// 環境変数
const FILE_STORAGE_BUCKET = process.env.FILE_STORAGE_BUCKET;
const FILE_GROUPS_TABLE = process.env.FILE_GROUPS_TABLE;
const FILES_TABLE = process.env.FILES_TABLE;
const ADMIN_EMAIL_TOPIC = process.env.ADMIN_EMAIL_TOPIC || '';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '90');

/**
 * ハンドラー関数
 */
exports.handler = async (event, context) => {
  console.log('Executing file cleanup process');
  
  // クリーンアップログ記録の初期化
  const cleanupLog = {
    timestamp: new Date().toISOString(),
    startTime: Date.now(),
    totalExpiredGroups: 0,
    totalFilesDeleted: 0,
    totalBytesFreed: 0,
    errors: [],
    successfulGroups: [],
    failedGroups: []
  };
  
  try {
    // 現在の日時
    const now = new Date().toISOString();
    
    // 期限切れファイルグループを検索
    const expiredGroups = await findExpiredFileGroups(now);
    cleanupLog.totalExpiredGroups = expiredGroups.length;
    
    if (expiredGroups.length === 0) {
      console.log('No expired file groups found');
      await publishCleanupMetrics(cleanupLog); // メトリクスを記録
      return { status: 'success', message: 'No expired groups', log: cleanupLog };
    }
    
    console.log(`Found ${expiredGroups.length} expired groups`);
    
    // 各グループのファイルを削除
    for (const group of expiredGroups) {
      try {
        const result = await processExpiredGroup(group);
        cleanupLog.totalFilesDeleted += result.filesDeleted;
        cleanupLog.totalBytesFreed += result.bytesFreed;
        cleanupLog.successfulGroups.push({
          groupId: group.groupId,
          fileName: group.fileName || 'unknown',
          owner: group.userId || 'unknown',
          expirationDate: group.expirationDate,
          filesDeleted: result.filesDeleted,
          bytesFreed: result.bytesFreed
        });
      } catch (groupError) {
        console.error(`Error processing group ${group.groupId}:`, groupError);
        cleanupLog.errors.push(groupError.message);
        cleanupLog.failedGroups.push({
          groupId: group.groupId,
          error: groupError.message
        });
      }
    }
    
    // 処理時間を記録
    cleanupLog.processingTimeMs = Date.now() - cleanupLog.startTime;
    
    // メトリクスとログを記録
    await publishCleanupMetrics(cleanupLog);
    
    // 月次サマリーを生成（月初めの場合）
    const today = new Date();
    if (today.getDate() === 1) {
      await generateMonthlySummary();
    }
    
    // エラーがあった場合は管理者に通知
    if (cleanupLog.errors.length > 0 && ADMIN_EMAIL_TOPIC) {
      await notifyAdminOfErrors(cleanupLog);
    }
    
    return {
      status: 'success',
      message: `Processed ${expiredGroups.length} expired groups, deleted ${cleanupLog.totalFilesDeleted} files, freed ${formatBytes(cleanupLog.totalBytesFreed)}`,
      log: cleanupLog
    };
  } catch (error) {
    console.error('Error in cleanup process:', error);
    cleanupLog.errors.push(error.message);
    
    // クリティカルエラーの場合は管理者に通知
    if (ADMIN_EMAIL_TOPIC) {
      await notifyAdminOfErrors(cleanupLog);
    }
    
    throw error;
  }
};

/**
 * 期限切れのファイルグループを検索
 */
async function findExpiredFileGroups(currentDate) {
  try {
    // DynamoDBから期限切れのファイルグループを検索
    const params = {
      TableName: FILE_GROUPS_TABLE,
      FilterExpression: 'expirationDate < :now',
      ExpressionAttributeValues: {
        ':now': currentDate
      }
    };
    
    const result = await dynamoDB.scan(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error('Error finding expired groups:', error);
    throw error;
  }
}

/**
 * 期限切れのファイルグループを処理
 */
async function processExpiredGroup(group) {
  try {
    console.log(`Processing expired group: ${group.groupId}`);
    
    // 結果の集計用オブジェクト
    const result = {
      filesDeleted: 0,
      bytesFreed: 0
    };
    
    // グループに属するファイルを検索
    const files = await findFilesInGroup(group.groupId);
    
    if (files.length > 0) {
      // ファイルのサイズ情報を取得
      for (const file of files) {
        if (file.fileSize) {
          result.bytesFreed += parseInt(file.fileSize, 10) || 0;
        }
      }
      
      // ファイルをS3から削除
      await deleteFilesFromS3(files);
      
      // ファイルのメタデータをDynamoDBから削除
      await deleteFileRecords(files);
      
      result.filesDeleted = files.length;
    }
    
    // ファイルグループのレコードを更新（または削除）
    await updateFileGroupStatus(group.groupId);
    
    // 削除ログを記録
    await logCleanupOperation({
      operationType: 'group_deletion',
      groupId: group.groupId,
      userId: group.userId || 'system',
      fileCount: files.length,
      bytesFreed: result.bytesFreed,
      timestamp: new Date().toISOString(),
      expirationDate: group.expirationDate
    });
    
    console.log(`Completed processing group: ${group.groupId}, deleted ${files.length} files, freed ${formatBytes(result.bytesFreed)}`);
    return result;
  } catch (error) {
    console.error(`Error processing group ${group.groupId}:`, error);
    throw error;
  }
}

/**
 * グループに属するファイルを検索
 */
async function findFilesInGroup(groupId) {
  try {
    const params = {
      TableName: FILES_TABLE,
      IndexName: 'GroupIdIndex',
      KeyConditionExpression: 'groupId = :groupId',
      ExpressionAttributeValues: {
        ':groupId': groupId
      }
    };
    
    const result = await dynamoDB.query(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error(`Error finding files in group ${groupId}:`, error);
    throw error;
  }
}

/**
 * ファイルをS3から削除
 */
async function deleteFilesFromS3(files) {
  try {
    const deletePromises = files.map(file => {
      const params = {
        Bucket: FILE_STORAGE_BUCKET,
        Key: file.s3Key
      };
      
      return s3.deleteObject(params).promise();
    });
    
    await Promise.all(deletePromises);
    console.log(`Deleted ${files.length} files from S3`);
  } catch (error) {
    console.error('Error deleting files from S3:', error);
    throw error;
  }
}

/**
 * ファイルのメタデータをDynamoDBから削除
 */
async function deleteFileRecords(files) {
  try {
    const deletePromises = files.map(file => {
      const params = {
        TableName: FILES_TABLE,
        Key: {
          fileId: file.fileId
        }
      };
      
      return dynamoDB.delete(params).promise();
    });
    
    await Promise.all(deletePromises);
    console.log(`Deleted ${files.length} file records from DynamoDB`);
  } catch (error) {
    console.error('Error deleting file records from DynamoDB:', error);
    throw error;
  }
}

/**
 * ファイルグループのステータスを更新
 */
async function updateFileGroupStatus(groupId) {
  try {
    // ここでは例としてグループを削除していますが、
    // 実際のケースでは削除ではなくステータスを「期限切れ」に更新するかもしれません
    const params = {
      TableName: FILE_GROUPS_TABLE,
      Key: {
        groupId: groupId
      }
    };
    
    await dynamoDB.delete(params).promise();
    console.log(`Deleted file group record: ${groupId}`);
  } catch (error) {
    console.error(`Error updating file group ${groupId}:`, error);
    throw error;
  }
}

/**
 * 削除操作のログを記録
 */
async function logCleanupOperation(logData) {
  try {
    // 削除操作の詳細をDynamoDBにログとして保存
    // 実際のプロジェクトではACCESS_LOGS_TABLEなどの既存テーブルを使用するか、
    // 専用のログテーブルを作成することも考えられます
    const logId = `cleanup-${new Date().getTime()}-${Math.random().toString(36).substring(2, 15)}`;
    
    // TTLを設定（ログ保持期間後に自動削除）
    const ttl = Math.floor(Date.now() / 1000) + (LOG_RETENTION_DAYS * 24 * 60 * 60);
    
    // ログデータに追加情報を付加
    const fullLogData = {
      ...logData,
      logId,
      ttl,
    };
    
    // DynamoDBへの書き込みはスキップしていますが、実際の実装ではここで書き込みます
    // 例: await dynamoDB.put({ TableName: 'CleanupLogsTable', Item: fullLogData }).promise();
    
    console.log('Cleanup operation logged:', fullLogData);
  } catch (error) {
    // ログ記録のエラーは、メインの処理を中断させないようにします
    console.error('Error logging cleanup operation:', error);
  }
}

/**
 * CloudWatchメトリクスにクリーンアップの結果を公開
 */
async function publishCleanupMetrics(cleanupLog) {
  try {
    // CloudWatchメトリクスにデータを送信
    const metricData = [
      {
        MetricName: 'ExpiredGroupsProcessed',
        Value: cleanupLog.totalExpiredGroups,
        Unit: 'Count',
        Timestamp: new Date(),
      },
      {
        MetricName: 'FilesDeleted',
        Value: cleanupLog.totalFilesDeleted,
        Unit: 'Count',
        Timestamp: new Date(),
      },
      {
        MetricName: 'BytesFreed',
        Value: cleanupLog.totalBytesFreed,
        Unit: 'Bytes',
        Timestamp: new Date(),
      },
      {
        MetricName: 'ErrorCount',
        Value: cleanupLog.errors.length,
        Unit: 'Count',
        Timestamp: new Date(),
      },
      {
        MetricName: 'ProcessingTime',
        Value: cleanupLog.processingTimeMs || 0,
        Unit: 'Milliseconds',
        Timestamp: new Date(),
      }
    ];
    
    await cloudwatch.putMetricData({
      Namespace: 'FileShareSystem/Cleanup',
      MetricData: metricData
    }).promise();
    
    console.log('Published cleanup metrics to CloudWatch');
  } catch (error) {
    // メトリクス公開のエラーは、メインの処理を中断させないようにします
    console.error('Error publishing CloudWatch metrics:', error);
  }
}

/**
 * 管理者にエラーを通知
 */
async function notifyAdminOfErrors(cleanupLog) {
  // SNSトピックが設定されていない場合はスキップ
  if (!ADMIN_EMAIL_TOPIC) {
    return;
  }
  
  try {
    const subject = `[警告] ファイルクリーンアップエラー (${new Date().toISOString()})`;
    
    // エラーメッセージの生成
    let errorMessage = `ファイル自動クリーンアップ中に${cleanupLog.errors.length}件のエラーが発生しました。\n\n`;
    errorMessage += `実行日時: ${cleanupLog.timestamp}\n`;
    errorMessage += `処理対象: ${cleanupLog.totalExpiredGroups}グループ\n`;
    errorMessage += `成功: ${cleanupLog.successfulGroups.length}グループ (削除ファイル数: ${cleanupLog.totalFilesDeleted}, 解放容量: ${formatBytes(cleanupLog.totalBytesFreed)})\n`;
    errorMessage += `失敗: ${cleanupLog.failedGroups.length}グループ\n\n`;
    
    // エラー詳細
    errorMessage += 'エラー詳細:\n';
    cleanupLog.errors.forEach((error, index) => {
      errorMessage += `${index + 1}. ${error}\n`;
    });
    
    // 失敗したグループの詳細
    if (cleanupLog.failedGroups.length > 0) {
      errorMessage += '\n失敗したグループ:\n';
      cleanupLog.failedGroups.forEach((group, index) => {
        errorMessage += `${index + 1}. GroupID: ${group.groupId}, エラー: ${group.error}\n`;
      });
    }
    
    // SNS経由で管理者にメール送信
    await sns.publish({
      TopicArn: ADMIN_EMAIL_TOPIC,
      Subject: subject,
      Message: errorMessage
    }).promise();
    
    console.log('Sent error notification to admin');
  } catch (error) {
    console.error('Error sending admin notification:', error);
  }
}

/**
 * 月次サマリーレポートの生成
 */
async function generateMonthlySummary() {
  try {
    // 前月の日付範囲を計算
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).toISOString();
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59).toISOString();
    
    console.log(`Generating monthly summary for period: ${lastMonthStart} to ${lastMonthEnd}`);
    
    // 実際の実装では、ここでDynamoDBから前月のクリーンアップログを取得します
    // 例: const logs = await queryLogsForPeriod(lastMonthStart, lastMonthEnd);
    
    // サンプルデータ（実際の実装では削除してください）
    const summary = {
      period: {
        start: lastMonthStart,
        end: lastMonthEnd
      },
      totalGroupsDeleted: 0,
      totalFilesDeleted: 0,
      totalBytesFreed: 0,
      topUsers: [],
      dailyStats: []
    };
    
    // レポートの生成と保存
    // 実際の実装では、S3にレポートを保存したり、
    // 管理者にメールなどで送信したりします
    
    // S3にレポートを保存する例
    const reportKey = `reports/monthly-cleanup-${lastMonth.getFullYear()}-${(lastMonth.getMonth() + 1).toString().padStart(2, '0')}.json`;
    
    await s3.putObject({
      Bucket: FILE_STORAGE_BUCKET,
      Key: reportKey,
      Body: JSON.stringify(summary, null, 2),
      ContentType: 'application/json'
    }).promise();
    
    console.log(`Monthly cleanup summary saved to S3: ${reportKey}`);
    
    // 管理者にレポートを通知する場合
    if (ADMIN_EMAIL_TOPIC) {
      try {
        const subject = `月次ファイルクリーンアップレポート - ${lastMonth.getFullYear()}年 ${lastMonth.getMonth() + 1}月`;
        
        let message = `ファイル共有システム - 月次自動クリーンアップレポート\n`;
        message += `期間: ${new Date(lastMonthStart).toLocaleDateString()} から ${new Date(lastMonthEnd).toLocaleDateString()}\n\n`;
        message += `削除結果サマリー:\n`;
        message += `- 削除グループ数: ${summary.totalGroupsDeleted}\n`;
        message += `- 削除ファイル数: ${summary.totalFilesDeleted}\n`;
        message += `- 解放された容量: ${formatBytes(summary.totalBytesFreed)}\n\n`;
        
        message += `詳細なレポートは次のS3パスで確認できます: ${reportKey}\n`;
        
        await sns.publish({
          TopicArn: ADMIN_EMAIL_TOPIC,
          Subject: subject,
          Message: message
        }).promise();
        
        console.log('Monthly summary notification sent to admin');
      } catch (notifyError) {
        console.error('Error sending monthly summary notification:', notifyError);
      }
    }
  } catch (error) {
    console.error('Error generating monthly cleanup summary:', error);
    // 月次レポートの生成エラーは、メインの処理を停止させない
  }
}

/**
 * バイト数を読みやすい形式にフォーマット
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}