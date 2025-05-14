// src/components/FileProtectionSettings.jsx
import React, { useState, useEffect } from 'react';
import fileService from '../services/FileService';

const FileProtectionSettings = ({ groupId, onClose, onUpdateSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [protectionData, setProtectionData] = useState({
    isPasswordProtected: false,
    password: '',
    confirmPassword: '',
    ipRestrictions: {
      enabled: false,
      allowedIps: []
    }
  });
  const [newIpAddress, setNewIpAddress] = useState('');

  // 初期データの取得
  useEffect(() => {
    const fetchProtectionData = async () => {
      if (!groupId) return;
      
      setLoading(true);
      try {
        // APIからファイル保護設定を取得
        const response = await fileService.getFileProtection(groupId);
        setProtectionData({
          isPasswordProtected: response.isPasswordProtected || false,
          password: '',
          confirmPassword: '',
          ipRestrictions: response.ipRestrictions || {
            enabled: false,
            allowedIps: []
          }
        });
        setError(null);
      } catch (err) {
        console.error('Failed to fetch protection settings:', err);
        setError('保護設定の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    
    fetchProtectionData();
  }, [groupId]);

  // パスワード保護の切り替え
  const handlePasswordProtectionChange = (e) => {
    setProtectionData({
      ...protectionData,
      isPasswordProtected: e.target.checked
    });
  };

  // パスワード入力の処理
  const handlePasswordChange = (e) => {
    setProtectionData({
      ...protectionData,
      password: e.target.value
    });
  };

  // パスワード確認入力の処理
  const handleConfirmPasswordChange = (e) => {
    setProtectionData({
      ...protectionData,
      confirmPassword: e.target.value
    });
  };

  // IP制限の切り替え
  const handleIpRestrictionsChange = (e) => {
    setProtectionData({
      ...protectionData,
      ipRestrictions: {
        ...protectionData.ipRestrictions,
        enabled: e.target.checked
      }
    });
  };

  // 新しいIPアドレス入力の処理
  const handleNewIpAddressChange = (e) => {
    setNewIpAddress(e.target.value);
  };

  // IPアドレスの追加
  const handleAddIpAddress = () => {
    if (!newIpAddress.trim()) return;
    
    // 既に存在するかチェック
    if (protectionData.ipRestrictions.allowedIps.includes(newIpAddress.trim())) {
      setError('このIPアドレスは既に登録されています');
      return;
    }
    
    // 簡易的なIPアドレス検証（より厳密な検証が必要な場合は正規表現を使用）
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^(\d{1,3}\.){0,3}\*$/;
    if (!ipPattern.test(newIpAddress.trim())) {
      setError('無効なIPアドレス形式です。xxx.xxx.xxx.xxxやxxx.xxx.*.* (ワイルドカード)または192.168.1.0/24 (CIDR)の形式で入力してください');
      return;
    }
    
    setProtectionData({
      ...protectionData,
      ipRestrictions: {
        ...protectionData.ipRestrictions,
        allowedIps: [...protectionData.ipRestrictions.allowedIps, newIpAddress.trim()]
      }
    });
    
    setNewIpAddress('');
    setError(null);
  };

  // IPアドレスの削除
  const handleRemoveIpAddress = (ipToRemove) => {
    setProtectionData({
      ...protectionData,
      ipRestrictions: {
        ...protectionData.ipRestrictions,
        allowedIps: protectionData.ipRestrictions.allowedIps.filter(ip => ip !== ipToRemove)
      }
    });
  };

  // 保護設定の保存
  const handleSaveProtection = async () => {
    // パスワード検証
    if (protectionData.isPasswordProtected) {
      if (!protectionData.password) {
        setError('パスワードを入力してください');
        return;
      }
      
      if (protectionData.password !== protectionData.confirmPassword) {
        setError('パスワードと確認用パスワードが一致しません');
        return;
      }
      
      if (protectionData.password.length < 8) {
        setError('パスワードは8文字以上で設定してください');
        return;
      }
    }
    
    setSaving(true);
    try {
      // 保存用のデータを準備
      const dataToSave = {
        password: protectionData.isPasswordProtected ? protectionData.password : null,
        ipRestrictions: {
          enabled: protectionData.ipRestrictions.enabled,
          allowedIps: protectionData.ipRestrictions.enabled ? protectionData.ipRestrictions.allowedIps : []
        }
      };
      
      // APIでファイル保護設定を更新
      await fileService.updateFileProtection(groupId, dataToSave);
      
      if (onUpdateSuccess) {
        onUpdateSuccess();
      }
      
      setError(null);
      
      // 成功メッセージの表示かモーダルを閉じるなどの処理
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to save protection settings:', err);
      setError('保護設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">ファイル保護設定</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {loading ? (
        <div className="text-center py-8">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-2 text-gray-600">読み込み中...</p>
        </div>
      ) : (
        <div>
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded mb-4">
              {error}
            </div>
          )}
          
          {/* パスワード保護設定 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">パスワード保護</h3>
            <div className="mb-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={protectionData.isPasswordProtected}
                  onChange={handlePasswordProtectionChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-gray-700">パスワード保護を有効にする</span>
              </label>
            </div>
            
            {protectionData.isPasswordProtected && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    パスワード
                  </label>
                  <input
                    type="password"
                    value={protectionData.password}
                    onChange={handlePasswordChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="新しいパスワード"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    パスワード (確認)
                  </label>
                  <input
                    type="password"
                    value={protectionData.confirmPassword}
                    onChange={handleConfirmPasswordChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="パスワードの確認"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  ※パスワードは8文字以上で設定してください
                </p>
              </div>
            )}
          </div>
          
          {/* IP制限設定 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">IPアドレス制限</h3>
            <div className="mb-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={protectionData.ipRestrictions.enabled}
                  onChange={handleIpRestrictionsChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-gray-700">特定のIPアドレスからのみアクセスを許可する</span>
              </label>
            </div>
            
            {protectionData.ipRestrictions.enabled && (
              <div>
                <div className="flex space-x-2 mb-4">
                  <input
                    type="text"
                    value={newIpAddress}
                    onChange={handleNewIpAddressChange}
                    className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="例: 192.168.1.1 または 192.168.1.* または 192.168.1.0/24"
                  />
                  <button
                    onClick={handleAddIpAddress}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    追加
                  </button>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-md">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">許可IPアドレス一覧</h4>
                  
                  {protectionData.ipRestrictions.allowedIps.length === 0 ? (
                    <p className="text-sm text-gray-500">許可IPアドレスが登録されていません</p>
                  ) : (
                    <ul className="space-y-2">
                      {protectionData.ipRestrictions.allowedIps.map((ip, index) => (
                        <li key={index} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200">
                          <span className="font-mono text-sm">{ip}</span>
                          <button
                            onClick={() => handleRemoveIpAddress(ip)}
                            className="text-red-600 hover:text-red-800"
                          >
                            削除
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  
                  <div className="mt-2">
                    <p className="text-xs text-gray-500">※ワイルドカード（*）やCIDR形式（192.168.1.0/24）が使用できます</p>
                    <p className="text-xs text-gray-500">※IPアドレスが登録されていない場合、すべてのIPからのアクセスを許可します</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* 操作ボタン */}
          <div className="flex justify-end space-x-3">
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={saving}
              >
                キャンセル
              </button>
            )}
            <button
              onClick={handleSaveProtection}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={saving}
            >
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileProtectionSettings;
