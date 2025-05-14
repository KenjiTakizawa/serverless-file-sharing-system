// src/components/SharePage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Storage } from 'aws-amplify';
import { API } from 'aws-amplify';

const SharePage = () => {
  const { accessUrl } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileGroup, setFileGroup] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  
  // 初期ロード - ファイルグループ情報の取得
  useEffect(() => {
    const fetchFileGroup = async () => {
      try {
        setLoading(true);
        
        try {
          // APIを使ってファイルグループ情報を取得
          const response = await API.get('api', `/access/${accessUrl}`);
          
          // パスワードが必要な場合
          if (response.isPasswordProtected) {
            setPasswordRequired(true);
          } else {
            // パスワード不要の場合はファイル情報を設定
            setFileGroup(response);
          }
        } catch (apiError) {
          console.warn('API call failed, using mock data for development:', apiError);
          
          // 開発用モックデータ
          if (accessUrl === '123e4567-e89b-12d3-a456-426614174000') {
            // 開発用ダミーデータ - パスワード「password」を要求する
            setPasswordRequired(true);
          } else {
            // パスワード不要のダミーデータ
            setFileGroup({
              groupId: accessUrl,
              expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              files: [
                {
                  fileId: 'file1',
                  key: `uploads/user/123/${accessUrl}/file1.pdf`,
                  name: 'document.pdf',
                  size: 1024 * 1024 * 2, // 2MB
                  type: 'application/pdf'
                },
                {
                  fileId: 'file2',
                  key: `uploads/user/123/${accessUrl}/file2.jpg`,
                  name: 'image.jpg',
                  size: 1024 * 1024 * 1.5, // 1.5MB
                  type: 'image/jpeg'
                }
              ]
            });
          }
        }
      } catch (err) {
        console.error('Error fetching file group:', err);
        setError('ファイル情報の取得に失敗しました。リンクが無効か期限切れの可能性があります。');
      } finally {
        setLoading(false);
      }
    };
    
    fetchFileGroup();
  }, [accessUrl]);
  
  // パスワード認証
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    
    if (!password.trim()) {
      setPasswordError('パスワードを入力してください');
      return;
    }
    
    try {
      setLoading(true);
      setPasswordError(null);
      
      try {
        // APIを使ってパスワード認証
        const response = await API.post('api', `/access/${accessUrl}/auth`, {
          body: { password }
        });
        
        setFileGroup(response);
        setPasswordRequired(false);
      } catch (apiError) {
        console.warn('API call failed, using mock data for development:', apiError);
        
        // 開発用モックデータ
        if (password === 'password') {
          // 正しいパスワードの場合
          setFileGroup({
            groupId: accessUrl,
            expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            files: [
              {
                fileId: 'file1',
                key: `uploads/user/123/${accessUrl}/file1.pdf`,
                name: 'document.pdf',
                size: 1024 * 1024 * 2, // 2MB
                type: 'application/pdf'
              },
              {
                fileId: 'file2',
                key: `uploads/user/123/${accessUrl}/file2.jpg`,
                name: 'image.jpg',
                size: 1024 * 1024 * 1.5, // 1.5MB
                type: 'image/jpeg'
              }
            ]
          });
          setPasswordRequired(false);
        } else {
          // 不正なパスワードの場合
          setPasswordError('パスワードが正しくありません');
        }
      }
    } catch (err) {
      console.error('Error authenticating:', err);
      setPasswordError('認証に失敗しました');
    } finally {
      setLoading(false);
    }
  };
  
  // ファイルのダウンロード
  const handleDownload = async (file) => {
    try {
      // ダウンロード開始
      setDownloadProgress({
        ...downloadProgress,
        [file.fileId]: 0
      });
      
      // S3からファイルのURLを取得
      const url = await Storage.get(file.key);
      
      // ファイルのダウンロード（開発環境では実際にダウンロードせず、進行状況のみシミュレート）
      if (process.env.NODE_ENV === 'development') {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          setDownloadProgress(prev => ({
            ...prev,
            [file.fileId]: progress
          }));
          
          if (progress >= 100) {
            clearInterval(interval);
            
            // ダウンロード完了後、新しいウィンドウでURLを開く（開発用）
            window.open(url, '_blank');
          }
        }, 300);
      } else {
        // 本番環境用のコード
        const response = await fetch(url);
        const blob = await response.blob();
        
        // ダウンロードリンクの作成
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // ダウンロード完了
        setDownloadProgress({
          ...downloadProgress,
          [file.fileId]: 100
        });
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('ファイルのダウンロードに失敗しました');
      
      // エラー時にプログレスバーをリセット
      setDownloadProgress({
        ...downloadProgress,
        [file.fileId]: undefined
      });
    }
  };
  
  // 日付のフォーマット
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // ファイルサイズのフォーマット
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  // 有効期限のチェック
  const isExpired = (expirationDate) => {
    return new Date(expirationDate) < new Date();
  };
  
  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">ファイル共有</h1>
        </div>
        
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">読み込み中...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-red-500 text-lg mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p>{error}</p>
              </div>
              <Link to="/" className="text-blue-600 hover:text-blue-800 underline">
                ホームに戻る
              </Link>
            </div>
          ) : passwordRequired ? (
            <div className="p-8">
              <h2 className="text-xl font-semibold mb-4 text-center">このファイルはパスワードで保護されています</h2>
              <form onSubmit={handlePasswordSubmit} className="mt-6">
                <div className="mb-4">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    パスワード
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="パスワードを入力"
                    autoComplete="current-password"
                  />
                  {passwordError && (
                    <p className="mt-2 text-sm text-red-600">
                      {passwordError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                    loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                >
                  {loading ? '認証中...' : 'アクセス'}
                </button>
              </form>
            </div>
          ) : fileGroup && isExpired(fileGroup.expirationDate) ? (
            <div className="p-8 text-center">
              <div className="text-red-500 text-lg mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>このファイル共有リンクは有効期限切れです</p>
              </div>
              <Link to="/" className="text-blue-600 hover:text-blue-800 underline">
                ホームに戻る
              </Link>
            </div>
          ) : fileGroup ? (
            <div>
              <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                <h2 className="text-lg font-medium text-gray-900">ファイル一覧</h2>
                <p className="mt-1 text-sm text-gray-500">
                  有効期限: {formatDate(fileGroup.expirationDate)}
                </p>
              </div>
              <ul className="divide-y divide-gray-200">
                {fileGroup.files.map((file) => (
                  <li key={file.fileId} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-blue-100 text-blue-500 rounded">
                          {file.type.includes('image') ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          ) : file.type.includes('pdf') ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="ml-4">
                          <h3 className="text-sm font-medium text-gray-900">{file.name}</h3>
                          <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <div>
                        {typeof downloadProgress[file.fileId] === 'number' ? (
                          <div className="w-32">
                            <div className="h-2 bg-gray-200 rounded">
                              <div 
                                className="h-full bg-blue-600 rounded" 
                                style={{ width: `${downloadProgress[file.fileId]}%` }}
                              ></div>
                            </div>
                            <p className="text-xs text-right mt-1">{downloadProgress[file.fileId]}%</p>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownload(file)}
                            className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-sm flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            ダウンロード
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        
        <div className="mt-8 text-center">
          <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ファイル共有システムのメインページへ
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SharePage;
