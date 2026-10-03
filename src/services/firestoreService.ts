import { doc, setDoc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import type { User, Project, Clip, Payment } from '../types';

export const firestoreService = {
  /**
   * Keep track of user data with Firestore
   */
  async syncUserProfile(user: User): Promise<void> {
    if (!auth.currentUser) {
      // If Firebase Auth session is not active on client, skip client Firestore mutation
      return;
    }

    const targetUid = auth.currentUser.uid;
    const path = `users/${targetUid}`;
    try {
      await setDoc(
        doc(db, 'users', targetUid),
        {
          id: targetUid,
          name: user.name || auth.currentUser.displayName || 'User',
          email: user.email || auth.currentUser.email || '',
          role: user.role,
          status: user.status,
          demo_used: Boolean(user.demo_used),
          createdAt: user.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Fetch user profile from Firestore
   */
  async getUserProfile(userId: string): Promise<any | null> {
    const targetUid = auth.currentUser?.uid || userId;
    const path = `users/${targetUid}`;
    try {
      const snap = await getDoc(doc(db, 'users', targetUid));
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  /**
   * Sync a project to Firestore under user subcollection
   */
  async syncProject(project: Project): Promise<void> {
    if (!auth.currentUser) return;

    const targetUid = auth.currentUser.uid;
    const path = `users/${targetUid}/projects/${project.id}`;
    try {
      await setDoc(
        doc(db, 'users', targetUid, 'projects', project.id),
        {
          id: project.id,
          userId: targetUid,
          name: project.name,
          originalFilename: project.original_filename,
          duration: project.duration || 0,
          status: project.status,
          createdAt: project.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Sync a generated clip to Firestore
   */
  async syncClip(clip: Clip): Promise<void> {
    if (!auth.currentUser) return;

    const targetUid = auth.currentUser.uid;
    const path = `users/${targetUid}/projects/${clip.project_id}/clips/${clip.id}`;
    try {
      await setDoc(
        doc(db, 'users', targetUid, 'projects', clip.project_id, 'clips', clip.id),
        {
          id: clip.id,
          projectId: clip.project_id,
          userId: targetUid,
          clipNumber: clip.clip_number,
          title: clip.title,
          duration: clip.duration,
          aspectRatio: clip.aspect_ratio,
          captionStatus: Boolean(clip.caption_status),
          createdAt: clip.created_at || new Date().toISOString(),
          transcriptSnippet: clip.transcript_snippet || '',
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Sync manual payment record to Firestore
   */
  async syncPayment(payment: Payment): Promise<void> {
    if (!auth.currentUser) return;

    const targetUid = auth.currentUser.uid;
    const path = `payments/${payment.id}`;
    try {
      await setDoc(
        doc(db, 'payments', payment.id),
        {
          id: payment.id,
          userId: targetUid,
          userEmail: payment.user_email || auth.currentUser.email || '',
          userName: payment.user_name || auth.currentUser.displayName || '',
          plan: payment.plan,
          amount: payment.amount,
          paymentMethod: payment.payment_method,
          transactionId: payment.transaction_id,
          status: payment.status,
          createdAt: payment.created_at || new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },
};
