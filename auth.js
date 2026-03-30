import { auth, db, storage } from "./firebase-config.js";
import { 
    signOut, onAuthStateChanged, updateProfile,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, getDoc, setDoc, serverTimestamp, updateDoc, 
    collection, query, where, getDocs, writeBatch, collectionGroup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const ADMIN_EMAIL = "yochanbr@gmail.com";

/**
 * Register a new Identity (Email/Password)
 */
async function registerUser(email, password) {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        
        // 1. Immediately update the Auth Profile for the observer
        const defaultName = email.split('@')[0];
        await updateProfile(user, {
            displayName: defaultName,
            photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${defaultName}`
        });

        // 2. Sync to Firestore
        await syncUserProfile(user);
        
        return user;
    } catch (error) {
        console.error("Registration Error:", error);
        throw error;
    }
}

/**
 * Sign In to an existing Identity
 */
async function signInUser(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;
        await syncUserProfile(user);
        return user;
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
}

/**
 * Recover a forgotten Identity Key
 */
async function sendRecoveryEmail(email) {
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (error) {
        console.error("Recovery Error:", error);
        throw error;
    }
}

/**
 * Sign Out from the App
 */
async function signOutUser() {
    try {
        await signOut(auth);
        window.location.reload(); // Refresh to show login ritual
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
}

/**
 * Upload a user's profile picture to Firebase Storage
 */
async function uploadUserAvatar(uid, file) {
    try {
        const storageRef = ref(storage, `avatars/${uid}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error("Avatar Upload Error:", error);
        throw error;
    }
}

/**
 * Update the user's profile across Auth and Firestore
 */
async function updateUserProfile(newName, newPhotoURL) {
    if (!auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const updates = { 
            displayName: newName
        };
        if (newPhotoURL) updates.photoURL = newPhotoURL;

        // 1. Update Firebase Auth Profile
        await updateProfile(auth.currentUser, updates);

        // 2. Update Firestore User Document (use setDoc + merge for reliability)
        const userRef = doc(db, "users", uid);
        await setDoc(userRef, updates, { merge: true });

        // 3. BACKGROUND SYNC: Update all existing content by this user
        (async () => {
            try {
                const uid = auth.currentUser.uid;
                const photoToUse = newPhotoURL || auth.currentUser.photoURL;

                // Sync Main Posts
                const postBatch = writeBatch(db);
                const postsQuery = query(collection(db, "posts"), where("authorId", "==", uid));
                const postsSnap = await getDocs(postsQuery);
                postsSnap.forEach(d => {
                    postBatch.update(d.ref, { authorName: newName, authorPhoto: photoToUse });
                });
                if (!postsSnap.empty) await postBatch.commit();

                // Sync Comments (Across ALL posts using Collection Group)
                const commentBatch = writeBatch(db);
                const commentsQuery = query(collectionGroup(db, "comments"), where("authorId", "==", uid));
                const commentsSnap = await getDocs(commentsQuery);
                commentsSnap.forEach(d => {
                    commentBatch.update(d.ref, { authorName: newName, authorPhoto: photoToUse });
                });
                if (!commentsSnap.empty) await commentBatch.commit();

                // Sync Notifications (sent by the user)
                const notifyBatch = writeBatch(db);
                // 1. Try syncing by senderId (new version)
                const notifyQuery = query(collection(db, "user_notifications"), where("senderId", "==", uid)); 
                const notifySnap = await getDocs(notifyQuery);
                notifySnap.forEach(d => {
                    notifyBatch.update(d.ref, { senderName: newName, senderPhoto: photoToUse });
                });
                
                // 2. Fallback: Sync by senderName (legacy version)
                const legacyNotifyQuery = query(collection(db, "user_notifications"), where("senderName", "==", auth.currentUser.displayName)); 
                const legacyNotifySnap = await getDocs(legacyNotifyQuery);
                legacyNotifySnap.forEach(d => {
                    notifyBatch.update(d.ref, { senderName: newName, senderPhoto: photoToUse });
                });

                if (!notifySnap.empty || !legacyNotifySnap.empty) {
                    await notifyBatch.commit();
                }

                console.log("Background Identity Sync Complete.");
            } catch (syncErr) {
                console.warn("Background Identity Sync Failed:", syncErr);
            }
        })();

        console.log("Profile updated successfully");
        return true;
    } catch (error) {
        console.error("Profile Update Error:", error);
        throw error;
    }
}

/**
 * Sync profile to our Firestore User DB
 */
async function syncUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // Default name from email if display name is empty
    const defaultName = user.displayName || user.email.split('@')[0];
    const defaultPhoto = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${defaultName}`;

    if (!userSnap.exists()) {
        // New User Initialization
        await setDoc(userRef, {
            displayName: defaultName,
            photoURL: defaultPhoto,
            email: user.email,
            shards: 0,
            level: 1,
            streak: 0,
            joinedAt: serverTimestamp(),
            lastLogin: serverTimestamp()
        });
    } else {
        // Update returning user
        await setDoc(userRef, {
            lastLogin: serverTimestamp()
        }, { merge: true });
    }
}

/**
 * Check if the current user is the Authorized Admin
 */
function isUserAdmin(user) {
    return user && user.email === ADMIN_EMAIL;
}

// Export for application logic
export { 
    auth, signOutUser, onAuthStateChanged, isUserAdmin, 
    updateUserProfile, uploadUserAvatar,
    signInUser, registerUser, sendRecoveryEmail
};
