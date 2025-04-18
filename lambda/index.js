const authFunctions = require('./auth');

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
    
    // 他のAPI Endpointはここに追加
    // ...

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