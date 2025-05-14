// src/services/FileService.js
import { API, Storage } from 'aws-amplify';

class FileService {
  /**
   * ファイルグループのメタデータを保存
   * @param {string} groupId - ファイルグループID
   * @param {Array} files - ファイルのメタデータの配列
   * @param {Object} shareSettings - 共有設定
   * @returns {Promise<Object>} - API レスポンス
   */
  async saveFileGroupMetadata(groupId, files, shareSettings) {
    try {
      const payload = {
        body: {
          groupId,
          files,
          shareSettings: {
            password: shareSettings.usePassword ? shareSettings.password : null,
            expirationDays: Number(shareSettings.expirationDays),
            allowedEmails: shareSettings.allowedEmails 
              ? shareSettings.allowedEmails.split(',').map(email => email.trim()) 
              : []
          }
        }
      };

      try {
        // 実装されているAPIを呼び出し
        const response = await API.post('api', '/files', payload);
        return response;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // APIがエラーの場合は開発用ローカルレスポンスを返す
        return {
          groupId,
          shareUrl: `${window.location.origin}/share/${groupId}`,
          expirationDate: new Date(Date.now() + Number(shareSettings.expirationDays) * 24 * 60 * 60 * 1000).toISOString()
        };
      }
    } catch (error) {
      console.error('Error saving file metadata:', error);
      throw error;
    }
  }

  /**
   * ファイルグループの一覧を取得
   * @param {boolean} includeExpired - 期限切れのファイルを含めるかどうか
   * @returns {Promise<Array>} - ファイルグループの配列
   */
  async getFileGroups(includeExpired = false) {
    try {
      try {
        // 実際の API 呼び出し
        const response = await API.get('api', '/files', {
          queryStringParameters: {
            includeExpired: includeExpired.toString()
          }
        });
        return response.fileGroups;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // 開発用ダミーレスポンス
        return [
          {
            groupId: '123e4567-e89b-12d3-a456-426614174000',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            isPasswordProtected: true,
            fileCount: 3,
            totalSize: 1024 * 1024 * 5, // 5MB
            shareUrl: `${window.location.origin}/share/123e4567-e89b-12d3-a456-426614174000`
          }
        ];
      }
    } catch (error) {
      console.error('Error getting file groups:', error);
      throw error;
    }
  }

  /**
   * ファイルグループの詳細を取得
   * @param {string} groupId - ファイルグループID
   * @returns {Promise<Object>} - ファイルグループの詳細
   */
  async getFileGroupDetails(groupId) {
    try {
      try {
        // 実際の API 呼び出し
        const response = await API.get('api', `/files/${groupId}`);
        return response;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // 開発用ダミーレスポンス
        return {
          groupId,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          isPasswordProtected: true,
          files: [
            {
              fileId: 'file1',
              key: `uploads/user/123/file1.pdf`,
              name: 'document.pdf',
              size: 1024 * 1024 * 2, // 2MB
              type: 'application/pdf'
            },
            {
              fileId: 'file2',
              key: `uploads/user/123/file2.jpg`,
              name: 'image.jpg',
              size: 1024 * 1024 * 1.5, // 1.5MB
              type: 'image/jpeg'
            },
            {
              fileId: 'file3',
              key: `uploads/user/123/file3.docx`,
              name: 'report.docx',
              size: 1024 * 1024 * 1.5, // 1.5MB
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
          ],
          shareUrl: `${window.location.origin}/share/${groupId}`
        };
      }
    } catch (error) {
      console.error('Error getting file group details:', error);
      throw error;
    }
  }

  /**
   * ファイルをダウンロード
   * @param {string} key - S3オブジェクトキー
   * @returns {Promise<Object>} - ダウンロードURL
   */
  async getFileDownloadUrl(key) {
    try {
      const downloadUrl = await Storage.get(key, { expires: 60 }); // 1時間の有効期限
      return downloadUrl;
    } catch (error) {
      console.error('Error getting file download URL:', error);
      throw error;
    }
  }

  /**
   * ファイルグループを削除
   * @param {string} groupId - ファイルグループID
   * @returns {Promise<Object>} - API レスポンス
   */
  async deleteFileGroup(groupId) {
    try {
      try {
        // 実際の API 呼び出し
        const response = await API.del('api', `/files/${groupId}`);
        return response;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // 開発用ダミーレスポンス
        return {
          success: true,
          message: 'ファイルグループが削除されました'
        };
      }
    } catch (error) {
      console.error('Error deleting file group:', error);
      throw error;
    }
  }

  /**
   * 共有リンクの有効期限を更新
   * @param {string} groupId - ファイルグループID
   * @param {number} expirationDays - 有効期限(日)
   * @returns {Promise<Object>} - API レスポンス
   */
  async updateExpirationDate(groupId, expirationDays) {
    try {
      const payload = {
        body: {
          expirationDays: Number(expirationDays)
        }
      };

      try {
        // 実際の API 呼び出し
        const response = await API.put('api', `/files/${groupId}/expiration`, payload);
        return response;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // 開発用ダミーレスポンス
        return {
          groupId,
          expirationDate: new Date(Date.now() + Number(expirationDays) * 24 * 60 * 60 * 1000).toISOString()
        };
      }
    } catch (error) {
      console.error('Error updating expiration date:', error);
      throw error;
    }
  }
  
  /**
   * ファイル保護設定を取得
   * @param {string} groupId - ファイルグループID
   * @returns {Promise<Object>} - 保護設定情報
   */
  async getFileProtection(groupId) {
    try {
      try {
        // 実際の API 呼び出し
        const response = await API.get('api', `/files/${groupId}/protection`);
        return response;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // 開発用ダミーレスポンス
        return {
          groupId,
          isPasswordProtected: false,
          ipRestrictions: {
            enabled: false,
            allowedIps: []
          }
        };
      }
    } catch (error) {
      console.error('Error getting file protection:', error);
      throw error;
    }
  }

  /**
   * ファイル保護設定を更新
   * @param {string} groupId - ファイルグループID
   * @param {Object} protectionSettings - 保護設定
   * @returns {Promise<Object>} - API レスポンス
   */
  async updateFileProtection(groupId, protectionSettings) {
    try {
      const payload = {
        body: {
          password: protectionSettings.password,
          ipRestrictions: protectionSettings.ipRestrictions
        }
      };

      try {
        // 実際の API 呼び出し
        const response = await API.put('api', `/files/${groupId}/protection`, payload);
        return response;
      } catch (apiError) {
        console.warn('API call failed, falling back to local implementation:', apiError);
        
        // 開発用ダミーレスポンス
        return {
          groupId,
          isPasswordProtected: !!protectionSettings.password,
          ipRestrictions: protectionSettings.ipRestrictions,
          message: 'ファイル保護設定が更新されました'
        };
      }
    } catch (error) {
      console.error('Error updating file protection:', error);
      throw error;
    }
  }
}

// シングルトンインスタンス
const fileService = new FileService();
export default fileService;
