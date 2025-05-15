// src/contexts/FileContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import fileService from '../services/FileService';
import shareService from '../services/shareService';
import { useAuth } from './AuthContext';

// FileContext作成
const FileContext = createContext();

// FileContext プロバイダー
export const FileProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [fileGroups, setFileGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showExpired, setShowExpired] = useState(false);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [currentGroupFiles, setCurrentGroupFiles] = useState([]);
  const [groupDetailsLoading, setGroupDetailsLoading] = useState(false);

  // ファイルグループの取得
  useEffect(() => {
    if (currentUser) {
      fetchFileGroups();
    }
  }, [currentUser, showExpired]);

  // ファイルグループ一覧を取得
  const fetchFileGroups = async () => {
    try {
      setLoading(true);
      const groups = await fileService.getFileGroups(showExpired);
      setFileGroups(groups);
      setError(null);
    } catch (err) {
      console.error('Error fetching file groups:', err);
      setError('ファイル一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ファイルグループの詳細を取得
  const fetchGroupDetails = async (groupId) => {
    if (!groupId) return;
    
    try {
      setGroupDetailsLoading(true);
      const groupDetails = await fileService.getFileGroupDetails(groupId);
      setCurrentGroup(groupDetails);
      setCurrentGroupFiles(groupDetails.files || []);
      return groupDetails;
    } catch (err) {
      console.error('Error fetching group details:', err);
      throw err;
    } finally {
      setGroupDetailsLoading(false);
    }
  };

  // ファイルグループを削除
  const deleteFileGroup = async (groupId) => {
    try {
      await fileService.deleteFileGroup(groupId);
      setFileGroups(prevGroups => prevGroups.filter(group => group.groupId !== groupId));
      return true;
    } catch (err) {
      console.error('Error deleting file group:', err);
      throw err;
    }
  };

  // 共有設定を更新
  const updateShareSettings = async (groupId, settings) => {
    try {
      // 有効期限の更新
      if (settings.expirationDays) {
        await fileService.updateExpirationDate(groupId, settings.expirationDays);
      }
      
      // パスワード保護設定の更新
      if (settings.password !== undefined) {
        await fileService.updateFileProtection(groupId, {
          password: settings.password,
          ipRestrictions: settings.ipRestrictions
        });
      }
      
      // グループ詳細を再取得
      const updatedGroup = await fetchGroupDetails(groupId);
      
      // 一覧も更新
      fetchFileGroups();
      
      return updatedGroup;
    } catch (err) {
      console.error('Error updating share settings:', err);
      throw err;
    }
  };

  // ダウンロードURLの取得
  const getDownloadUrl = async (key) => {
    try {
      return await fileService.getFileDownloadUrl(key);
    } catch (err) {
      console.error('Error getting download URL:', err);
      throw err;
    }
  };

  // ファイルのプレビューが可能かチェック
  const canPreviewFile = (fileType) => {
    const previewableTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/html', 'text/css', 'text/javascript',
      'application/json'
    ];
    return previewableTypes.includes(fileType);
  };

  // 共有URLのコピー
  const copyShareUrl = (url) => {
    navigator.clipboard.writeText(url);
    return true;
  };

  // QRコードのURLを生成
  const getQRCodeUrl = (url) => {
    // Google Charts APIを使用してQRコードを生成
    return `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(url)}`;
  };

  // 共有リンクを生成
  const generateShareLink = async (fileGroupId, shareSettings) => {
    try {
      return await shareService.generateShareLink(fileGroupId, shareSettings);
    } catch (err) {
      console.error('Error generating share link:', err);
      throw err;
    }
  };

  // メールで共有リンクを送信
  const sendShareEmail = async (fileGroupId, recipients, subject, message) => {
    try {
      return await shareService.sendShareEmail(fileGroupId, recipients, subject, message);
    } catch (err) {
      console.error('Error sending share email:', err);
      throw err;
    }
  };

  // 共有リンクのアクセス状況を取得
  const getShareStats = async (fileGroupId) => {
    try {
      return await shareService.getShareStats(fileGroupId);
    } catch (err) {
      console.error('Error getting share stats:', err);
      throw err;
    }
  };

  // コンテキスト値
  const value = {
    fileGroups,
    loading,
    error,
    showExpired,
    setShowExpired,
    currentGroup,
    currentGroupFiles,
    groupDetailsLoading,
    fetchFileGroups,
    fetchGroupDetails,
    deleteFileGroup,
    updateShareSettings,
    getDownloadUrl,
    canPreviewFile,
    copyShareUrl,
    getQRCodeUrl,
    generateShareLink,
    sendShareEmail,
    getShareStats
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
};

// FileContext フック
export const useFiles = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFiles must be used within a FileProvider');
  }
  return context;
};

export default FileContext;
