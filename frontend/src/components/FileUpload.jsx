// src/components/FileUpload.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { Storage } from 'aws-amplify';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';
import fileService from '../services/FileService';

const FileUpload = () => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadResult, setUploadResult] = useState(null);
  const [shareSettings, setShareSettings] = useState({
    usePassword: false,
    password: '',
    expirationDays: 7,
    allowedEmails: ''
  });
  
  const { currentUser } = useAuth();
  
  // エラー更新のタイマーハンドル
  const [errorTimer, setErrorTimer] = useState(null);
  
  // エラー表示が一定時間後に消えるようにする
  useEffect(() => {
    if (uploadResult && !uploadResult.success) {
      const timer = setTimeout(() => {
        setUploadResult(null);
      }, 8000); // 8秒後にエラーを消す
      
      setErrorTimer(timer);
      
      return () => {
        clearTimeout(timer);
      };
    }
    
    return () => {
      if (errorTimer) {
        clearTimeout(errorTimer);
      }
    };
  }, [uploadResult, errorTimer]);
  
  // ファイルの最大サイズのチェック
  const checkFilesSize = (files) => {
    const maxTotalSize = 2 * 1024 * 1024 * 1024; // 2GB
    let totalSize = 0;
    
    for (const file of files) {
      totalSize += file.size;
    }
    
    return totalSize <= maxTotalSize;
  };
  
  // ファイル選択時の処理
  const handleFileChange = (e) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      
      // ファイルサイズのチェック
      if (!checkFilesSize([...files, ...newFiles])) {
        setUploadResult({
          success: false,
          message: 'ファイルの合計サイズが上限（2GB）を超えています。'
        });
        return;
      }
      
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };
  
  // ファイルドロップ時の処理
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files);
      
      // ファイルサイズのチェック
      if (!checkFilesSize([...files, ...newFiles])) {
        setUploadResult({
          success: false,
          message: 'ファイルの合計サイズが上限（2GB）を超えています。'
        });
        return;
      }
      
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  }, [files]);
  
  // ドラッグオーバー時のデフォルト動作を防止
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  // 選択したファイルの削除
  const removeFile = (index) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };
  
  // 共有設定の変更
  const handleSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setShareSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // ファイルの拡張子を取得
  const getFileExtension = (filename) => {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
  };
  
  // ファイルアップロード
  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setUploadResult(null);
    
    try {
      const groupId = uuidv4(); // ファイルグループのID
      const uploadedFiles = [];
      
      // ファイルごとにアップロード
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = uuidv4();
        const extension = getFileExtension(file.name);
        const key = `uploads/${currentUser.username}/${groupId}/${fileId}.${extension}`;
        
        // アップロードプログレスの監視
        setUploadProgress(prev => ({
          ...prev,
          [i]: 0
        }));
        
        // S3にアップロード
        await Storage.put(key, file, {
          contentType: file.type,
          progressCallback(progress) {
            const percentUploaded = Math.round((progress.loaded / progress.total) * 100);
            setUploadProgress(prev => ({
              ...prev,
              [i]: percentUploaded
            }));
          },
          metadata: {
            fileId,
            groupId,
            originalName: file.name,
            contentType: file.type,
            size: file.size.toString()
          }
        });
        
        uploadedFiles.push({
          fileId,
          key,
          name: file.name,
          size: file.size,
          type: file.type
        });
      }
      
      // メタデータをAPIに保存
      const metadataResponse = await saveFileGroupMetadata(groupId, uploadedFiles, shareSettings);
      
      // アップロード成功
      setUploadResult({
        success: true,
        message: `${files.length}個のファイルがアップロードされました`,
        groupId,
        shareUrl: metadataResponse.shareUrl
      });
      
      // 入力をリセット
      setFiles([]);
      setUploadProgress({});
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({
        success: false,
        message: `エラーが発生しました: ${error.message || 'アップロードに失敗しました'}`
      });
    } finally {
      setUploading(false);
    }
  };
  
  // メタデータをAPIに保存
  const saveFileGroupMetadata = async (groupId, files, settings) => {
    try {
      // FileServiceを直接使用してメタデータを保存
      const response = await fileService.saveFileGroupMetadata(groupId, files, settings);
      return response;
    } catch (error) {
      console.error('Error saving metadata:', error);
      throw error;
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">ファイルアップロード</h2>
      
      {/* ドラッグ&ドロップエリア */}
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center mb-4 ${
          files.length > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="flex flex-col items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mb-2 text-sm text-gray-500">
            <span className="font-semibold">クリックしてファイルを選択</span>
            <span>またはドラッグ&ドロップ</span>
          </p>
          <p className="text-xs text-gray-500">
            サポートされているすべてのファイル形式（最大合計サイズ: 2GB）
          </p>
          <input
            id="fileInput"
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => document.getElementById('fileInput').click()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={uploading}
          >
            ファイルを選択
          </button>
        </div>
      </div>
      
      {/* 選択されたファイル一覧 */}
      {files.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-medium mb-2">選択されたファイル ({files.length})</h3>
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                {uploading ? (
                  <div className="w-24">
                    <div className="h-2 bg-gray-200 rounded">
                      <div 
                        className="h-full bg-blue-600 rounded" 
                        style={{ width: `${uploadProgress[index] || 0}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-right mt-1">{uploadProgress[index] || 0}%</p>
                  </div>
                ) : (
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* 共有設定 */}
      {files.length > 0 && !uploading && (
        <div className="mb-6 border rounded-lg p-4">
          <h3 className="text-md font-medium mb-3">共有設定</h3>
          
          <div className="space-y-4">
            {/* パスワード保護 */}
            <div>
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="usePassword"
                  name="usePassword"
                  checked={shareSettings.usePassword}
                  onChange={handleSettingChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="usePassword" className="ml-2 block text-sm text-gray-700">
                  パスワード保護を有効にする
                </label>
              </div>
              
              {shareSettings.usePassword && (
                <input
                  type="password"
                  name="password"
                  value={shareSettings.password}
                  onChange={handleSettingChange}
                  placeholder="パスワードを入力"
                  className="w-full p-2 text-sm border rounded"
                />
              )}
            </div>
            
            {/* 有効期限 */}
            <div>
              <label htmlFor="expirationDays" className="block text-sm text-gray-700 mb-1">
                有効期限
              </label>
              <select
                id="expirationDays"
                name="expirationDays"
                value={shareSettings.expirationDays}
                onChange={handleSettingChange}
                className="w-full p-2 text-sm border rounded"
              >
                <option value="1">1日</option>
                <option value="3">3日</option>
                <option value="7">1週間</option>
                <option value="14">2週間</option>
                <option value="30">1ヶ月</option>
                <option value="90">3ヶ月</option>
              </select>
            </div>
            
            {/* 特定のメールアドレスのみアクセス可能 */}
            <div>
              <label htmlFor="allowedEmails" className="block text-sm text-gray-700 mb-1">
                アクセス許可するメールアドレス（オプション、カンマ区切り）
              </label>
              <input
                type="text"
                id="allowedEmails"
                name="allowedEmails"
                value={shareSettings.allowedEmails}
                onChange={handleSettingChange}
                placeholder="example1@domain.com, example2@domain.com"
                className="w-full p-2 text-sm border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">
                空白の場合、リンクを持つすべてのユーザーがアクセスできます
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* アップロードボタン */}
      {files.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className={`px-6 py-2 rounded font-medium ${
              uploading 
                ? 'bg-gray-400 text-white cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {uploading ? 'アップロード中...' : 'アップロード'}
          </button>
        </div>
      )}
      
      {/* アップロード結果メッセージ */}
      {uploadResult && (
        <div className={`mt-4 p-4 rounded-md ${
          uploadResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {uploadResult.success ? (
                <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                {uploadResult.message}
              </p>
              {uploadResult.success && uploadResult.shareUrl && (
                <div className="mt-2">
                  <p className="text-sm">共有URL:</p>
                  <div className="flex mt-1">
                    <input 
                      type="text" 
                      value={uploadResult.shareUrl} 
                      readOnly 
                      className="flex-grow p-1 text-sm border rounded-l"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(uploadResult.shareUrl);
                        alert('URLをコピーしました');
                      }}
                      className="bg-blue-600 text-white px-2 rounded-r"
                    >
                      コピー
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
