// src/components/LoginScreen.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginScreen = () => {
  const [view, setView] = useState('login'); // login, forgotPassword, resetSent, resetSuccess
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 認証コンテキストから関数を取得
  const { login, requestPasswordReset, confirmPasswordReset, error: authError, clearError } = useAuth();

  // 認証エラーを監視
  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  // ビュー変更時にエラーをクリア
  useEffect(() => {
    setError('');
    clearError();
  }, [view, clearError]);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.message);
      }
      // 成功時はリダイレクト（親コンポーネントで処理）
    } catch (err) {
      setError('ログイン処理中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    
    if (!resetEmail) {
      setError('メールアドレスを入力してください');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset(resetEmail);
      if (result.success) {
        setView('resetSent');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('パスワードリセット要求中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    
    if (!resetCode || !newPassword || !confirmPassword) {
      setError('すべての項目を入力してください');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await confirmPasswordReset(resetEmail, resetCode, newPassword);
      if (result.success) {
        setView('resetSuccess');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('パスワードリセット中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-gray-50 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="flex items-center">
            <div className="h-8 w-8 text-blue-600 mr-2">🛡️</div>
            <h1 className="text-2xl font-bold text-gray-800">社内ファイル共有システム</h1>
          </div>
        </div>

        {view === 'login' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1">社内ユーザーログイン</h2>
              <p className="text-gray-600 text-sm mb-4">
                社内ユーザーのみアップロード機能を利用できます。許可されたIPアドレスからアクセスしてください。
              </p>
              <form onSubmit={handleLogin}>
                <div className="space-y-4">
                  {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                      ⚠️ {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">メールアドレス</label>
                    <input 
                      id="email" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="your-email@company.com" 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700">パスワード</label>
                      <button 
                        type="button"
                        onClick={() => {
                          setView('forgotPassword');
                          setResetEmail(email); // 入力済みのメールアドレスを引き継ぐ
                        }}
                        disabled={isSubmitting}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        パスワードを忘れた場合
                      </button>
                    </div>
                    <input 
                      id="password" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className="mt-6">
                  <button 
                    type="submit" 
                    className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'ログイン中...' : 'ログイン'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === 'forgotPassword' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1">パスワードリセット</h2>
              <p className="text-gray-600 text-sm mb-4">
                登録済みのメールアドレスにリセットコードを送信します。
              </p>
              <form onSubmit={handleRequestReset}>
                <div className="space-y-4">
                  {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                      ⚠️ {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">メールアドレス</label>
                    <input 
                      id="resetEmail" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="your-email@company.com" 
                      type="email" 
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-between">
                  <button 
                    type="button" 
                    className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={() => {
                      setView('login');
                    }}
                    disabled={isSubmitting}
                  >
                    ← 戻る
                  </button>
                  <button 
                    type="submit"
                    className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? '送信中...' : 'リセットコード送信'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === 'resetSent' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1">リセットコード送信完了</h2>
              <p className="text-gray-600 text-sm mb-4">
                {resetEmail} にリセットコードを送信しました。メールに記載されたコードを入力してパスワードをリセットしてください。
              </p>
              <form onSubmit={handleConfirmReset}>
                <div className="space-y-4">
                  {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                      ⚠️ {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label htmlFor="resetCode" className="block text-sm font-medium text-gray-700">リセットコード</label>
                    <input 
                      id="resetCode" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="123456" 
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">新しいパスワード</label>
                    <input 
                      id="newPassword" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      type="password" 
                      placeholder="12文字以上の強力なパスワード"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-gray-500">※12文字以上で大文字、小文字、数字、記号を含むパスワードを設定してください</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">パスワード確認</label>
                    <input 
                      id="confirmPassword" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      type="password" 
                      placeholder="新しいパスワードを再入力"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-between">
                  <button 
                    type="button" 
                    className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={() => {
                      setView('forgotPassword');
                    }}
                    disabled={isSubmitting}
                  >
                    ← 戻る
                  </button>
                  <button 
                    type="submit"
                    className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? '処理中...' : 'パスワードを変更'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === 'resetSuccess' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1 flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                パスワード変更完了
              </h2>
              <p className="text-gray-600 text-sm mb-4">
                パスワードの変更が完了しました。新しいパスワードでログインしてください。
              </p>
              <div className="bg-green-50 text-green-800 p-4 rounded-md mb-6">
                <div className="flex items-center text-sm">
                  <span className="mr-2">📧</span>
                  <span>登録されたメールアドレス: {resetEmail}</span>
                </div>
              </div>
              <button 
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={() => {
                  setView('login');
                  setEmail(resetEmail);
                  setPassword('');
                }}
              >
                ログイン画面に戻る
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;