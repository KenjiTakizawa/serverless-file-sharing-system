// src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { Auth } from 'aws-amplify';

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
        const user = await Auth.currentAuthenticatedUser();
        if (user) {
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
      const user = await Auth.signIn(email, password);
      setCurrentUser(user);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'ログインに失敗しました。');
      return { success: false, message: err.message || 'ログインに失敗しました。' };
    } finally {
      setLoading(false);
    }
  };

  // ログアウト処理
  const logout = async () => {
    try {
      setLoading(true);
      await Auth.signOut();
      setCurrentUser(null);
      return { success: true };
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
      await Auth.forgotPassword(email);
      return { success: true, message: 'パスワードリセット用のコードを送信しました。メールをご確認ください。' };
    } catch (err) {
      console.error('Password reset request error:', err);
      setError(err.message || 'パスワードリセット要求に失敗しました。');
      return { success: false, message: err.message || 'パスワードリセット要求に失敗しました。' };
    } finally {
      setLoading(false);
    }
  };

  // パスワードリセット確認
  const confirmPasswordReset = async (email, code, newPassword) => {
    try {
      setLoading(true);
      setError(null);
      await Auth.forgotPasswordSubmit(email, code, newPassword);
      return { success: true, message: 'パスワードのリセットが完了しました。新しいパスワードでログインしてください。' };
    } catch (err) {
      console.error('Password reset confirmation error:', err);
      setError(err.message || 'パスワードリセットに失敗しました。');
      return { success: false, message: err.message || 'パスワードリセットに失敗しました。' };
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
