// src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import authService from '../services/AuthService';

// 認証コンテキストの作成
const AuthContext = createContext(null);

// 認証プロバイダーコンポーネント
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // アプリケーション起動時に現在のユーザーを取得
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        setLoading(true);
        const { success, user } = await authService.getCurrentUser();
        if (success && user) {
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('Failed to fetch current user:', err);
        setError('ユーザー情報の取得に失敗しました。');
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  // ログイン処理
  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      const result = await authService.login(email, password);
      
      if (result.success) {
        setCurrentUser(result.user);
        return { success: true };
      } else {
        setError(result.message);
        return { success: false, message: result.message };
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('ログインに失敗しました。');
      return { success: false, message: 'ログインに失敗しました。' };
    } finally {
      setLoading(false);
    }
  };

  // ログアウト処理
  const logout = async () => {
    try {
      setLoading(true);
      const result = await authService.logout();
      
      if (result.success) {
        setCurrentUser(null);
        return { success: true };
      } else {
        setError(result.message);
        return { success: false, message: result.message };
      }
    } catch (err) {
      console.error('Logout error:', err);
      setError('ログアウトに失敗しました。');
      return { success: false, message: 'ログアウトに失敗しました。' };
    } finally {
      setLoading(false);
    }
  };

  // パスワードリセット要求
  const requestPasswordReset = async (email) => {
    try {
      setLoading(true);
      setError(null);
      const result = await authService.requestPasswordReset(email);
      
      if (!result.success) {
        setError(result.message);
      }
      
      return result;
    } catch (err) {
      console.error('Password reset request error:', err);
      setError('パスワードリセット要求に失敗しました。');
      return { success: false, message: 'パスワードリセット要求に失敗しました。' };
    } finally {
      setLoading(false);
    }
  };

  // パスワードリセット確認
  const confirmPasswordReset = async (email, code, newPassword) => {
    try {
      setLoading(true);
      setError(null);
      const result = await authService.confirmPasswordReset(email, code, newPassword);
      
      if (!result.success) {
        setError(result.message);
      }
      
      return result;
    } catch (err) {
      console.error('Password reset confirmation error:', err);
      setError('パスワードリセットに失敗しました。');
      return { success: false, message: 'パスワードリセットに失敗しました。' };
    } finally {
      setLoading(false);
    }
  };

  // 認証状態のクリア
  const clearError = () => {
    setError(null);
  };

  // コンテキスト値
  const value = {
    currentUser,
    loading,
    error,
    login,
    logout,
    requestPasswordReset,
    confirmPasswordReset,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// 認証コンテキストを使用するためのカスタムフック
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;