// src/components/ShareSettings.js
import React, { useState, useEffect } from 'react';
import { useFiles } from '../contexts/FileContext';

const ShareSettings = ({ groupId, currentSettings }) => {
  const { updateShareSettings } = useFiles();
  
  const [expirationDays, setExpirationDays] = useState(7);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [ipRestriction, setIpRestriction] = useState(false);
  const [allowedIps, setAllowedIps] = useState('');
  const [allowedEmails, setAllowedEmails] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // 現在の設定を初期値として設定
  useEffect(() => {
    if (currentSettings) {
      // 有効期限から残り日数を計算
      if (currentSettings.expirationDate) {
        const now = new Date();
        const expDate = new Date(currentSettings.expirationDate);
        const diffTime = Math.abs(expDate - now);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setExpirationDays(diffDays);
      }
      
      // パスワード保護設定
      setUsePassword(currentSettings.isPasswordProtected || false);
    }
  }, [currentSettings]);
  
  // 設定更新の処理
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      const settings = {
        expirationDays: Number(expirationDays),
        password: usePassword ? password : null,
        ipRestrictions: ipRestriction ? {
          enabled: true,
          allowedIps: allowedIps.split(',').map(ip => ip.trim())
        } : {
          enabled: false,
          allowedIps: []
        },
        allowedEmails: allowedEmails ? allowedEmails.split(',').map(email => email.trim()) : []
      };
      
      await updateShareSettings(groupId, settings);
      
      setSuccessMessage('共有設定を更新しました');
      // 3秒後に成功メッセージを消す
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error updating share settings:', error);
      setErrorMessage('共有設定の更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">共有設定</h3>
      
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative">
          {successMessage}
        </div>
      )}
      
      {errorMessage && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
          {errorMessage}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            有効期限設定
          </label>
          <div className="flex items-center">
            <select
              value={expirationDays}
              onChange={(e) => setExpirationDays(e.target.value)}
              className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="1">1日</option>
              <option value="3">3日</option>
              <option value="7">1週間</option>
              <option value="14">2週間</option>
              <option value="30">1ヶ月</option>
              <option value="90">3ヶ月</option>
            </select>
            <span className="ml-2 text-sm text-gray-500">
              （現在の有効期限：{currentSettings?.expirationDate ? new Date(currentSettings.expirationDate).toLocaleDateString('ja-JP') : '不明'}）
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            ファイルへのアクセスが可能な期間を設定します。期限後はファイルは自動的に削除されます。
          </p>
        </div>
        
        <div className="mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(e) => setUsePassword(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-gray-700">パスワード保護を有効にする</span>
          </label>
          
          {usePassword && (
            <div className="mt-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                required={usePassword}
                minLength={6}
              />
              <p className="text-sm text-gray-500 mt-1">
                共有リンクにアクセスする際に必要となるパスワードを設定します。
              </p>
            </div>
          )}
        </div>
        
        <div className="mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={ipRestriction}
              onChange={(e) => setIpRestriction(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-gray-700">IPアドレス制限を有効にする</span>
          </label>
          
          {ipRestriction && (
            <div className="mt-2">
              <input
                type="text"
                value={allowedIps}
                onChange={(e) => setAllowedIps(e.target.value)}
                placeholder="許可するIPアドレス（カンマ区切り）"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                required={ipRestriction}
              />
              <p className="text-sm text-gray-500 mt-1">
                指定したIPアドレスからのみファイルへのアクセスを許可します。例：192.168.1.1, 10.0.0.0/24
              </p>
            </div>
          )}
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            許可するメールアドレス（オプション）
          </label>
          <input
            type="text"
            value={allowedEmails}
            onChange={(e) => setAllowedEmails(e.target.value)}
            placeholder="example@company.com, user@example.com"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          />
          <p className="text-sm text-gray-500 mt-1">
            特定のメールアドレスのみファイルへのアクセスを許可します。空白の場合は制限しません。
          </p>
        </div>
        
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={loading}
            className={`${
              loading ? 'bg-blue-300' : 'bg-blue-500 hover:bg-blue-700'
            } text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center`}
          >
            {loading && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            設定を保存
          </button>
        </div>
      </form>
    </div>
  );
};

export default ShareSettings;
