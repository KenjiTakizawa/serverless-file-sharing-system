const authFunctions = require('./auth');
const filesFunctions = require('./files');

/**
 * API Gatewayのイベントを処理するメインハンドラー
 */
exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event));

  try {
    // CORSプリフライトリクエストの対応
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
          'Access-Control-Max-Age': '86400',
        },
        body: ''
      };
    }

    // パスとメソッドに基づいて適切なハンドラーを呼び出す
    const { path, httpMethod } = event;
    
    // auth endpoints
    if (path === '/auth' && httpMethod === 'POST') {
      return await authFunctions.handleLogin(event, context);
    }
    
    if (path === '/auth/reset-password' && httpMethod === 'POST') {
      return await authFunctions.handleRequestPasswordReset(event, context);
    }
    
    if (path === '/auth/reset-password/confirm' && httpMethod === 'POST') {
      return await authFunctions.handleConfirmPasswordReset(event, context);
    }
    
    // ファイル関連のエンドポイント
    if (path === '/files' && httpMethod === 'POST') {
      return await filesFunctions.handleCreateFileGroup(event, context);
    }
    
    // '/files/{groupId}' エンドポイントを処理
    const groupIdMatch = path.match(/^\/files\/([\w-]+)$/);
    if (groupIdMatch) {
      if (httpMethod === 'GET') {
        return await filesFunctions.handleGetFileGroupDetails(event, context);
      } else if (httpMethod === 'DELETE') {
        return await filesFunctions.handleDeleteFileGroup(event, context);
      }
    }
    
    // '/files/{groupId}/expiration' エンドポイントを処理
    const expirationMatch = path.match(/^\/files\/([\w-]+)\/expiration$/);
    if (expirationMatch && httpMethod === 'PUT') {
      return await filesFunctions.handleUpdateExpirationDate(event, context);
    }
    
    // 一致するパスが見つからない場合は404を返す
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Not Found' })
    };
  } catch (error) {
    console.error('Unhandled error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Internal Server Error' })
    };
  }
};