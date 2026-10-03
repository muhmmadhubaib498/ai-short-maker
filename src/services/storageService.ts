import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface StorageUploadProgress {
  loaded: number;
  total: number;
  percent: number;
  stage: string;
  statusText: string;
}

export const storageService = {
  /**
   * Direct client-side video upload to Firebase Storage
   * Supports files up to 2GB (2048MB) completely bypassing reverse-proxy request body limits
   */
  uploadVideo: (
    file: File,
    userId: string,
    onProgress?: (progress: StorageUploadProgress) => void
  ): Promise<{ storageUrl: string; storagePath: string }> => {
    return new Promise((resolve, reject) => {
      // 2GB limit validation (2048MB)
      const MAX_BYTES = 2048 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        return reject(new Error('Video file exceeds the 2GB (2048MB) limit. Please choose a file up to 2GB.'));
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = Date.now();
      const storagePath = `uploads/${userId}/${timestamp}_${safeName}`;
      const storageRef = ref(storage, storagePath);

      const metadata = {
        contentType: file.type || 'video/mp4',
        customMetadata: {
          originalName: file.name,
          uploadedBy: userId,
          createdAt: new Date().toISOString(),
        },
      };

      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const loaded = snapshot.bytesTransferred;
          const total = snapshot.totalBytes || file.size;
          const rawPercent = total > 0 ? loaded / total : 0;
          // Scale to 5% - 92% during direct upload
          const percent = Math.min(92, Math.max(5, Math.round(rawPercent * 92)));
          const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
          const mbTotal = (total / (1024 * 1024)).toFixed(1);
          const statusText = `Uploading directly to Firebase Storage: ${mbLoaded}MB / ${mbTotal}MB (${percent}%)`;

          onProgress?.({
            loaded,
            total,
            percent,
            stage: 'uploading',
            statusText,
          });
        },
        (error) => {
          console.error('Firebase Storage upload error:', error);
          reject(new Error(`Firebase Storage upload failed: ${error.message}`));
        },
        async () => {
          try {
            onProgress?.({
              loaded: file.size,
              total: file.size,
              percent: 95,
              stage: 'processing',
              statusText: 'Uploaded to Firebase Storage. Generating secure access URL...',
            });

            const storageUrl = await getDownloadURL(uploadTask.snapshot.ref);

            onProgress?.({
              loaded: file.size,
              total: file.size,
              percent: 98,
              stage: 'processing',
              statusText: 'Connecting to AI Shorts Engine...',
            });

            resolve({ storageUrl, storagePath });
          } catch (urlErr: any) {
            reject(new Error(`Failed to retrieve Firebase Storage download URL: ${urlErr.message}`));
          }
        }
      );
    });
  },
};
