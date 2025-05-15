// src/components/FileUpload.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';
import fileService from '../services/FileService';
import FileUploader from './FileUploader';
import UploadProgress from './UploadProgress';

const FileUpload = () => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadResult, setUploadResult] = useState(null);
  const [cancelUpload, setCancelUpload] = useState(false);
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
  
  // ファイルの選択処理
  const handleFilesSelected = useCallback((selectedFiles) => {
    setFiles(prevFiles => [...prevFiles, ...selectedFiles]);
    // 選択後にアップロード結果をリセット
    setUploadResult(null);
  }, []);
  
  // ファイルの削除処理
  const handleRemoveFile = useCallback((index) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  }, []);
  
  // アップロードキャンセル
  const handleCancelUpload = useCallback(() => {
    setCancelUpload(true);
  }, []);
  
  // 共有設定の変更
  const handleSettingChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setShareSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);
  
  // ファイルアップロード
  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setUploadResult(null);
    setUploadProgress({});
    setCancelUpload(false);
    
    try {
      const groupId = uuidv4();
      
      // 進捗コールバック
      const progressCallback = (index, progress) => {
        setUploadProgress(prev => ({
          ...prev,
          [index]: Math.round((progress.loaded / progress.total) * 100)
        }));
      };
      
      // キャンセルチェックコールバック
      const cancelCheckCallback = () => cancelUpload;
      
      // ファイルのアップロード
      const uploadResult = await fileService.uploadMultipleFiles(
        files,
        currentUser.username,
        groupId,
        progressCallback,
        cancelCheckCallback
      );
      
      if (cancelUpload) {
        setUploadResult({
          success: false,
          message: 'アップロードがキャンセルされました'
        });
        return;
      }
      
      // メタデータをAPIに保存
      const metadataResponse = await fileService.saveFileGroupMetadata(
        uploadResult.groupId,
        uploadResult.files,
        shareSettings
      );
      
      // アップロード成功
      setUploadResult({
        success: true,
        message: `${files.length}個のファイルがアップロードされました`,
        groupId: uploadResult.groupId,
        shareUrl: metadataResponse.shareUrl
      });
      
      // 入力をリセット
      setFiles([]);
      
    } catch (error) {
      console.error('Upload error:', error);
      
      if (cancelUpload) {
        setUploadResult({
          success: false,
          message: 'アップロードがキャンセルされました'
        });
      } else {
        setUploadResult({
          success: false,
          message: `エラーが発生しました: ${error.message || 'アップロードに失敗しました'}`
        });
      }
    } finally {
      setUploading(false);
      setCancelUpload(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">ファイルアップロード</h2>
      
      {/* ファイルアップローダーコンポーネント */}
      {!uploading && (
        <FileUploader
          onFilesSelected={handleFilesSelected}
          maxFileSize={2 * 1024 * 1024 * 1024} // 2GB
          className="mb-4"
        />
      )}
      
      {/* 選択されたファイル一覧とアップロード進捗 */}
      {files.length > 0 && (
        <div className="mb-6">
          <UploadProgress
            files={files}
            progress={uploadProgress}
            onCancelUpload={handleCancelUpload}
            onRemoveFile={handleRemoveFile}
            uploading={uploading}
          />
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
      {files.length > 0 && !uploading && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            disabled={files.length === 0}
            className="px-6 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            アップロード
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
                      className="bg-blue-600 text-white px-2 rounded-r hover:bg-blue-700 transition-colors"
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
