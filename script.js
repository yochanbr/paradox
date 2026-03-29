/**
 * PARADOX. - CORE APP LOGIC
 * Integrated with Firebase & Google Identity
 */

import { auth, signInWithGoogle, signOutUser, onAuthStateChanged, isUserAdmin } from "./auth.js";
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, updateDoc, increment, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. LOCAL DEVELOPMENT MODE TOGGLE
    // ==========================================
    const LOCAL_DEV_MODE = false; // Set to 'true' for local testing, 'false' for production

    // ==========================================
    // 1. IDENTITY & LOGIN RITUAL
    // ==========================================
    const loginOverlay = document.getElementById('login-overlay');
    const loginBtn = document.getElementById('login-google-btn');
    const profileName = document.querySelector('.hero-name');
    const profileAvatar = document.querySelector('.hero-avatar');
    const headerAvatar = document.querySelector('.user-chip img');
    const adminPortalLink = document.querySelector('a[href="admin.html"]')?.parentElement;

    // Handle Login Click
    loginBtn?.addEventListener('click', async () => {
        try {
            loginBtn.textContent = "Entering Paradox...";
            await signInWithGoogle();
        } catch (err) {
            loginBtn.textContent = "Continue with Google";
            console.error("Login Failed", err);
        }
    });

    // Monitor Auth State
    onAuthStateChanged(auth, async (user) => {
        if (LOCAL_DEV_MODE) {
            console.warn("DEV MODE ACTIVE: Bypassing auth check.");
            loginOverlay?.classList.add('hidden');
        }

        if (user) {
            console.log("Welcome,", user.displayName);
            if (!LOCAL_DEV_MODE) loginOverlay?.classList.add('hidden');
            
            // Sync UI with Profile
            if (profileName) profileName.textContent = user.displayName;
            if (profileAvatar) profileAvatar.src = user.photoURL;
            if (headerAvatar) headerAvatar.src = user.photoURL;

            // Security: Check for Admin Portal
            if (adminPortalLink) {
                adminPortalLink.style.display = isUserAdmin(user) ? 'flex' : 'none';
            }

            // Load User Stats & Feed
            loadUserStats(user.uid);
            initRealtimeFeed();
            initRealtimeChallenges();
            initRealtimeNotifications();
        } else {
            if (!LOCAL_DEV_MODE) loginOverlay?.classList.remove('hidden');
        }
    });

    // ==========================================
    // 2. VIEW NAVIGATION SYSTEM
    // ==========================================
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.app-view');
    const headerTitle = document.getElementById('header-title');

    function switchView(viewId) {
        views.forEach(v => v.classList.toggle('active', v.id === `view-${viewId}`));
        navButtons.forEach(btn => {
            const isActive = btn.getAttribute('data-view') === viewId;
            btn.classList.toggle('active', isActive);
            btn.querySelector('.material-symbols-rounded')?.classList.toggle('fill-icon', isActive);
        });
        headerTitle.textContent = viewId === 'home' ? 'Paradox.' : viewId.charAt(0).toUpperCase() + viewId.slice(1);
    }

    navButtons.forEach(btn => btn.addEventListener('click', () => switchView(btn.getAttribute('data-view'))));

    // ==========================================
    // 3. GLOBAL DRAWER MANAGEMENT
    // ==========================================
    const allDrawers = document.querySelectorAll('.drawer');
    const closeAllDrawers = () => allDrawers.forEach(d => d.classList.remove('open'));

    function wireDrawer(openBtnId, drawerId, closeBtnId) {
        const openBtn = document.getElementById(openBtnId);
        const drawer = document.getElementById(drawerId);
        const closeBtn = document.getElementById(closeBtnId);

        if (openBtn && drawer) {
            openBtn.addEventListener('click', () => {
                if (!drawer.classList.contains('drawer-secondary')) closeAllDrawers();
                drawer.classList.add('open');
            });
        }
        if (closeBtn && drawer) closeBtn.addEventListener('click', () => drawer.classList.remove('open'));
    }

    wireDrawer('open-create-btn', 'create-drawer', 'close-create-btn');
    wireDrawer('open-profile-btn', 'profile-drawer', 'close-profile-btn');
    wireDrawer('open-notifications-btn', 'notification-drawer', 'close-notifications-btn');
    wireDrawer('open-saved-dox-btn', 'saved-dox-drawer', 'close-saved-dox-btn');
    wireDrawer('open-my-public-dox-btn', 'my-public-dox-drawer', 'close-my-public-dox-btn');

    // Composer Triggers
    const composers = [
        { triggers: ['open-status-btn', 'open-compose-btn'], drawer: 'compose-post-drawer', close: 'close-compose-btn' },
        { triggers: ['open-goal-btn', 'open-goal-widget-btn', 'open-goal-inner-btn'], drawer: 'goal-composer-drawer', close: 'close-goal-composer-btn' },
        { triggers: ['open-journal-entry-btn'], drawer: 'journal-composer-drawer', close: 'close-journal-composer-btn' }
    ];

    composers.forEach(cfg => {
        const drawer = document.getElementById(cfg.drawer);
        cfg.triggers.forEach(tId => {
            document.getElementById(tId)?.addEventListener('click', () => {
                document.getElementById('create-drawer')?.classList.remove('open');
                drawer?.classList.add('open');
            });
        });
        document.getElementById(cfg.close)?.addEventListener('click', () => drawer?.classList.remove('open'));
    });

    // ==========================================
    // 4. REAL-TIME DATABASE SYNC (FIRESTORE)
    // ==========================================
    
    // Load Posts
    function initRealtimeFeed() {
        const feedContainer = document.getElementById('home-feed');
        if (!feedContainer) return;
        const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));

        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                feedContainer.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">auto_stories</span><p>Feed is empty.</p></div>`;
                return;
            }
            feedContainer.innerHTML = '';
            snapshot.forEach((doc) => {
                const post = doc.data();
                const postEl = createPostElement(doc.id, post);
                feedContainer.appendChild(postEl);
            });
        });
    }

    // Load Challenges (Real-time from Admin)
    function initRealtimeChallenges() {
        const challengesContainer = document.getElementById('challenges-container');
        if (!challengesContainer) return;

        const q = query(collection(db, "challenges"), orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                challengesContainer.innerHTML = `<div class="empty-state-mini"><span class="material-symbols-rounded">emoji_events</span><p>No active challenges.</p></div>`;
                return;
            }
            challengesContainer.innerHTML = '';
            snapshot.forEach((doc) => {
                const chal = doc.data();
                const card = document.createElement('div');
                card.className = 'challenge-card-premium';
                card.innerHTML = `
                    <div class="card-chip highlight">Current Challenge</div>
                    <h2>${chal.title}</h2>
                    <p class="challenge-rule">${chal.rule}</p>
                    <div class="challenge-meta-grid">
                        <div class="meta-item reward">
                            <span class="label">Reward</span>
                            <span class="value">+${chal.reward} Shards</span>
                        </div>
                    </div>
                    <button class="action-btn-large challenge-accept-btn">Accept Challenge</button>
                `;
                challengesContainer.appendChild(card);
            });
        });
    }

    // Load Notifications (Real-time from Admin Broadcast)
    function initRealtimeNotifications() {
        const notiContainer = document.querySelector('.notifications-list');
        const badge = document.querySelector('.notification-badge');
        if (!notiContainer) return;

        const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                notiContainer.innerHTML = `<div class="empty-notif"><span class="material-symbols-rounded">notifications_off</span><p>No new updates.</p></div>`;
                return;
            }
            notiContainer.innerHTML = '';
            let newNotifs = 0;
            snapshot.forEach((doc) => {
                const n = doc.data();
                newNotifs++;
                const item = document.createElement('div');
                item.className = 'notification-item';
                item.innerHTML = `
                    <div class="noti-icon"><span class="material-symbols-rounded">campaign</span></div>
                    <div class="noti-body">
                        <h4>Admin Broadcast</h4>
                        <p>${n.message}</p>
                    </div>
                `;
                notiContainer.appendChild(item);
            });
            if (badge && newNotifs > 0) {
                badge.style.display = 'block';
                badge.textContent = newNotifs;
            }
        });
    }

    function createPostElement(id, post) {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.innerHTML = `
            <div class="post-header">
                <img src="${post.authorPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'}" class="post-avatar">
                <div class="post-meta">
                    <h4>${post.authorName}</h4>
                    <span>${post.timestamp?.toDate().toLocaleDateString() || 'Just now'}</span>
                </div>
            </div>
            <div class="post-content"><p>${post.text}</p></div>
            <div class="post-interactions">
                <button class="interaction-btn like-btn" data-id="${id}">
                    <span class="material-symbols-rounded">favorite</span>
                    <span>${post.likes || 0}</span>
                </button>
                <button class="interaction-btn comment-btn"><span class="material-symbols-rounded">chat_bubble</span></button>
                <button class="interaction-btn save-btn" data-id="${id}"><span class="material-symbols-rounded">bookmark</span></button>
            </div>
        `;
        return div;
    }

    // Save Post
    const savePostBtn = document.getElementById('save-post-btn');
    savePostBtn?.addEventListener('click', async () => {
        const text = document.querySelector('.compose-input').value;
        if (!text) return;

        savePostBtn.textContent = "Sharing...";
        try {
            await addDoc(collection(db, "posts"), {
                text: text,
                authorId: auth.currentUser.uid,
                authorName: auth.currentUser.displayName,
                authorPhoto: auth.currentUser.photoURL,
                likes: 0,
                timestamp: serverTimestamp()
            });
            showToast("Paradox Shared");
            closeAllDrawers();
            document.querySelector('.compose-input').value = '';
        } catch (e) {
            console.error(e);
        } finally {
            savePostBtn.textContent = "POST";
        }
    });

    // Load Stats
    async function loadUserStats(uid) {
        const sShards = document.getElementById('stat-shards');
        const sLevel = document.getElementById('stat-level');
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (sShards) sShards.textContent = data.shards || 0;
            if (sLevel) sLevel.textContent = data.level || 1;
        }
    }

    // ==========================================
    // 5. UTILITIES & DATE ENGINE
    // ==========================================
    function initDates() {
        const now = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('home-month-label').textContent = `${monthNames[now.getMonth()]}, ${now.getFullYear()}`;
        document.getElementById('home-day-num').textContent = now.getDate();
        document.getElementById('home-day-name').textContent = now.toLocaleDateString('en-US', { weekday: 'long' });
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container?.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    initDates();
});
