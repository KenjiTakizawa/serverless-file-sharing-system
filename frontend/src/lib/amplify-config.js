// src/lib/amplify-config.js
import { Amplify } from 'aws-amplify';

// 環境変数または設定ファイルから値を取得
const REGION = process.env.REACT_APP_AWS_REGION || 'ap-northeast-1';
const USER_POOL_ID = process.env.REACT_APP_USER_POOL_ID;
const USER_POOL_WEB_CLIENT_ID = process.env.REACT_APP_USER_POOL_CLIENT_ID;
const IDENTITY_POOL_ID = process.env.REACT_APP_IDENTITY_POOL_ID;
const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT;

// Amplify設定
const amplifyConfig = {
  Auth: {
    region: REGION,
    userPoolId: USER_POOL_ID,
    userPoolWebClientId: USER_POOL_WEB_CLIENT_ID,
    identityPoolId: IDENTITY_POOL_ID,
    mandatorySignIn: true,
  },
  API: {
    endpoints: [
      {
        name: 'FileShareAPI',
        endpoint: API_ENDPOINT,
        region: REGION,
        custom_header: async () => {
          return {
            Authorization: `Bearer ${(await Amplify.Auth.currentSession()).getIdToken().getJwtToken()}`
          };
        }
      }
    ]
  },
  Storage: {
    AWSS3: {
      bucket: process.env.REACT_APP_S3_BUCKET,
      region: REGION,
    }
  }
};

// Amplify初期化
Amplify.configure(amplifyConfig);

export default amplifyConfig;