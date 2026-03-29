/**
 * PARADOX - IDENTITY & AUTH
 */

import { auth, provider, db } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_EMAIL = "yochanbr@gmail.com";

/**
 * Trigger the Google Login Ritual
 */
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Sync User Profile to Firestore
        await syncUserProfile(user);
        
        console.log("Authenticated:", user.displayName);
        return user;
    } catch (error) {
        console.error("Auth Error:", error);
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
 * Sync Google profile to our Firestore User DB
 */
async function syncUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // New User Initialization
        await setDoc(userRef, {
            displayName: user.displayName,
            photoURL: user.photoURL,
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
            displayName: user.displayName,
            photoURL: user.photoURL,
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
export { auth, signInWithGoogle, signOutUser, onAuthStateChanged, isUserAdmin };
