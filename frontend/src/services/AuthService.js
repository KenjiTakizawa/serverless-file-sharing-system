// src/services/AuthService.js
import { Auth, API } from 'aws-amplify';

class AuthService {
  /**
   * ログイン処理
   * @param {string} email - メールアドレス
   * @param {string} password - パスワード
   * @returns {Promise<Object>} - ログイン結果
   */
  async login(email, password) {
    try {
      // AmplifyのAuthを使ってCognitoにログイン
      const user = await Auth.signIn(email, password);
      return {
        success: true,
        user,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: this._getErrorMessage(error),
        error,
      };
    }
  }

  /**
   * ログアウト処理
   * @returns {Promise<Object>} - ログアウト結果
   */
  async logout() {
    try {
      await Auth.signOut();
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        message: 'ログアウトに失敗しました。',
        error,
      };
    }
  }

  /**
   * 現在のログインユーザーを取得
   * @returns {Promise<Object>} - ユーザー情報
   */
  async getCurrentUser() {
    try {
      const user = await Auth.currentAuthenticatedUser();
      return {
        success: true,
        user,
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return {
        success: false,
        message: 'ユーザー情報の取得に失敗しました。',
        error,
      };
    }
  }

  /**
   * パスワードリセット要求
   * @param {string} email - メールアドレス
   * @returns {Promise<Object>} - リクエスト結果
   */
  async requestPasswordReset(email) {
    try {
      // AmplifyのAuthでパスワードリセット要求
      await Auth.forgotPassword(email);
      return {
        success: true,
        message: 'パスワードリセット用のコードを送信しました。メールをご確認ください。',
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      return {
        success: false,
        message: this._getErrorMessage(error),
        error,
      };
    }
  }

  /**
   * パスワードリセット確認
   * @param {string} email - メールアドレス
   * @param {string} code - 確認コード
   * @param {string} newPassword - 新しいパスワード
   * @returns {Promise<Object>} - リセット結果
   */
  async confirmPasswordReset(email, code, newPassword) {
    try {
      // パスワードの複雑性チェック
      if (!this._validatePasswordComplexity(newPassword)) {
        return {
          success: false,
          message: 'パスワードは12文字以上で、大文字、小文字、数字、記号をすべて含める必要があります。',
        };
      }

      // AmplifyのAuthでパスワードリセット確認
      await Auth.forgotPasswordSubmit(email, code, newPassword);
      return {
        success: true,
        message: 'パスワードのリセットが完了しました。新しいパスワードでログインしてください。',
      };
    } catch (error) {
      console.error('Password reset confirmation error:', error);
      return {
        success: false,
        message: this._getErrorMessage(error),
        error,
      };
    }
  }

  /**
   * パスワードの複雑性をチェック
   * @param {string} password - チェックするパスワード
   * @returns {boolean} - 有効なパスワードかどうか
   */
  _validatePasswordComplexity(password) {
    if (password.length < 12) return false;
    
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const validCategories = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars]
      .filter(Boolean).length;
    
    return validCategories >= 4;
  }

  /**
   * エラーメッセージを取得
   * @param {Error} error - エラーオブジェクト
   * @returns {string} - エラーメッセージ
   */
  _getErrorMessage(error) {
    if (!error) return '不明なエラーが発生しました。';
    
    switch (error.code) {
      case 'UserNotFoundException':
        return 'メールアドレスまたはパスワードが正しくありません。';
      case 'NotAuthorizedException':
        return 'メールアドレスまたはパスワードが正しくありません。';
      case 'CodeMismatchException':
        return '確認コードが正しくありません。';
      case 'ExpiredCodeException':
        return '確認コードの有効期限が切れています。再度リセットをリクエストしてください。';
      case 'InvalidPasswordException':
        return 'パスワードが要件を満たしていません。12文字以上で、大文字、小文字、数字、記号を含める必要があります。';
      case 'LimitExceededException':
        return 'リクエスト回数が多すぎます。しばらく待ってから再度お試しください。';
      default:
        return error.message || '処理に失敗しました。後ほど再度お試しください。';
    }
  }
}

// シングルトンインスタンス
const authService = new AuthService();
export default authService;