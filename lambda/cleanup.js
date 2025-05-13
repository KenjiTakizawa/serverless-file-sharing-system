// ファイルの自動削除を処理するLambda関数
const AWS = require('aws-sdk');

// AWSサービスのインスタンス化
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

// 環境変数
const FILE_STORAGE_BUCKET = process.env.FILE_STORAGE_BUCKET;
const FILE_GROUPS_TABLE = process.env.FILE_GROUPS_TABLE;
const FILES_TABLE = process.env.FILES_TABLE;

/**
 * ハンドラー関数
 */
exports.handler = async (event, context) => {
  console.log('Executing file cleanup process');
  
  try {
    // 現在の日時
    const now = new Date().toISOString();
    
    // 期限切れファイルグループを検索
    const expiredGroups = await findExpiredFileGroups(now);
    
    if (expiredGroups.length === 0) {
      console.log('No expired file groups found');
      return { status: 'success', message: 'No expired groups' };
    }
    
    console.log(`Found ${expiredGroups.length} expired groups`);
    
    // 各グループのファイルを削除
    for (const group of expiredGroups) {
      await processExpiredGroup(group);
    }
    
    return {
      status: 'success',
      message: `Processed ${expiredGroups.length} expired groups`
    };
  } catch (error) {
    console.error('Error in cleanup process:', error);
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
    
    // グループに属するファイルを検索
    const files = await findFilesInGroup(group.groupId);
    
    if (files.length > 0) {
      // ファイルをS3から削除
      await deleteFilesFromS3(files);
      
      // ファイルのメタデータをDynamoDBから削除
      await deleteFileRecords(files);
    }
    
    // ファイルグループのレコードを更新（または削除）
    await updateFileGroupStatus(group.groupId);
    
    console.log(`Completed processing group: ${group.groupId}`);
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