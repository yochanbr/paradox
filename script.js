/**
 * PARADOX. - CORE APP LOGIC
 * Integrated with Firebase & Google Identity
 */

import { auth, signInWithGoogle, signOutUser, onAuthStateChanged, isUserAdmin } from "./auth.js";
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, updateDoc, increment, getDoc,
    arrayUnion, arrayRemove, setDoc, where
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
            listenToUserSavedDox(user.uid);
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
    wireDrawer('open-feed-filter-btn', 'feed-filter-drawer', 'close-feed-filter-btn');

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
    let currentFeedFilter = 'global';
    window.currentUserSavedDox = [];

    function listenToUserSavedDox(uid) {
        onSnapshot(doc(db, "users", uid), (docSnap) => {
            if (docSnap.exists()) {
                window.currentUserSavedDox = docSnap.data().savedDox || [];
                // Refresh feed rendering gently to show new bookmark UI
                const activeFeedCards = document.querySelectorAll('.post-card');
                activeFeedCards.forEach(card => {
                    const id = card.dataset.id;
                    const saveBtn = card.querySelector('.save-btn');
                    if (saveBtn) {
                        saveBtn.classList.toggle('active', window.currentUserSavedDox.includes(id));
                    }
                });
            }
        });
    }

    function initRealtimeFeed() {
        const feedContainer = document.getElementById('home-feed');
        if (!feedContainer) return;
        const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));

        onSnapshot(q, (snapshot) => {
            feedContainer.innerHTML = '';
            let hasPosts = false;
            snapshot.forEach((doc) => {
                const post = doc.data();
                
                // Client-side filtering to avoid complex composite indexing on Firebase setup
                if (currentFeedFilter === 'mine' && post.authorId !== auth?.currentUser?.uid) return;

                hasPosts = true;
                const postEl = createPostElement(doc.id, post);
                feedContainer.appendChild(postEl);
            });
            
            if (!hasPosts) {
                feedContainer.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">auto_stories</span><p>No dox found for this filter.</p></div>`;
            }
        });

        // Event delegation for post interactions (Likes, Comments, Saves)
        feedContainer.addEventListener('click', async (e) => {
            const likeBtn = e.target.closest('.like-btn');
            const saveBtn = e.target.closest('.save-btn');
            const commentBtn = e.target.closest('.comment-btn');

            if (likeBtn && auth.currentUser) {
                const postId = likeBtn.dataset.id;
                const authorId = likeBtn.dataset.author;
                const isLiked = likeBtn.classList.contains('active');
                
                // Optimistic UI update
                likeBtn.classList.toggle('active');
                const countSpan = likeBtn.querySelector('.likes-count');
                countSpan.textContent = parseInt(countSpan.textContent) + (isLiked ? -1 : 1);

                const postRef = doc(db, "posts", postId);
                await updateDoc(postRef, {
                    likedBy: isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid),
                    likes: increment(isLiked ? -1 : 1)
                });

                if (!isLiked && authorId !== auth.currentUser.uid) {
                    notifyUser(authorId, "liked your paradox.");
                }
            }

            if (saveBtn && auth.currentUser) {
                const postId = saveBtn.dataset.id;
                const isSaved = saveBtn.classList.contains('active');
                
                // Optimistic UI
                saveBtn.classList.toggle('active');

                const userRef = doc(db, "users", auth.currentUser.uid);
                await setDoc(userRef, {
                    savedDox: isSaved ? arrayRemove(postId) : arrayUnion(postId)
                }, { merge: true });
            }

            if (commentBtn) {
                const postId = commentBtn.dataset.id;
                const authorId = commentBtn.dataset.author;
                openCommentsDrawer(postId, authorId);
            }
        });
    }

    // ==========================================
    // 4.5 NOTIFICATIONS & COMMENTS LOGIC
    // ==========================================
    
    async function notifyUser(recipientId, message) {
        if (!recipientId || recipientId === auth.currentUser?.uid) return;
        
        await addDoc(collection(db, "user_notifications"), {
            recipientId: recipientId,
            senderName: auth.currentUser.displayName,
            senderPhoto: auth.currentUser.photoURL,
            message: message,
            timestamp: serverTimestamp(),
            read: false
        });
    }

    let activeCommentUnsubscribe = null;
    let activeCommentPostId = null;
    let activeCommentPostAuthor = null;

    function openCommentsDrawer(postId, authorId) {
        activeCommentPostId = postId;
        activeCommentPostAuthor = authorId;
        
        // Setup UI Profile for Input
        const commenterAvatar = document.getElementById('commenter-avatar');
        if (commenterAvatar && auth.currentUser) commenterAvatar.src = auth.currentUser.photoURL;

        const commentsList = document.getElementById('comments-list');
        const input = document.getElementById('comment-input');
        const sendBtn = document.getElementById('send-comment-btn');
        
        input.value = '';
        sendBtn.disabled = true;

        if (activeCommentUnsubscribe) activeCommentUnsubscribe();
        
        commentsList.innerHTML = `<div class="empty-state-mini"><span class="material-symbols-rounded">sync</span><p>Loading conversation...</p></div>`;
        
        const q = query(collection(db, "posts", postId, "comments"), orderBy("timestamp", "asc"));
        
        activeCommentUnsubscribe = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                commentsList.innerHTML = `<div class="empty-state-mini"><span class="material-symbols-rounded">forum</span><p>No comments yet. Be the first.</p></div>`;
                return;
            }
            commentsList.innerHTML = '';
            snapshot.forEach((docSnap) => {
                const c = docSnap.data();
                const div = document.createElement('div');
                div.className = 'comment-bubble';
                div.innerHTML = `
                    <img src="${c.authorPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'}" class="tiny-avatar">
                    <div class="comment-body">
                        <h4>${c.authorName} <span>${c.timestamp?.toDate().toLocaleDateString() || 'Now'}</span></h4>
                        <p>${c.text}</p>
                    </div>
                `;
                commentsList.appendChild(div);
            });
            // Scroll to bottom
            const drawerContent = commentsList.parentElement;
            drawerContent.scrollTop = drawerContent.scrollHeight;
        });

        // Open Drawer
        document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
        document.getElementById('comments-drawer').classList.add('open');
    }

    // Handle Comment Sending
    const cInput = document.getElementById('comment-input');
    const cBtn = document.getElementById('send-comment-btn');
    
    if (cInput && cBtn) {
        cInput.addEventListener('input', () => { cBtn.disabled = cInput.value.trim().length === 0; });
        
        cBtn.addEventListener('click', async () => {
            const text = cInput.value.trim();
            if (!text || !activeCommentPostId) return;

            cBtn.disabled = true;
            try {
                // Add to subcollection
                await addDoc(collection(db, "posts", activeCommentPostId, "comments"), {
                    text: text,
                    authorId: auth.currentUser.uid,
                    authorName: auth.currentUser.displayName,
                    authorPhoto: auth.currentUser.photoURL,
                    timestamp: serverTimestamp()
                });

                // Update post count
                await updateDoc(doc(db, "posts", activeCommentPostId), {
                    commentsCount: increment(1)
                });
                
                // Notify Author
                notifyUser(activeCommentPostAuthor, "commented on your paradox.");
                
                cInput.value = '';
            } catch (err) {
                console.error("Error commenting:", err);
                cBtn.disabled = false;
            }
        });
    }

    // Close Comments
    document.getElementById('close-comments-btn')?.addEventListener('click', () => {
        document.getElementById('comments-drawer').classList.remove('open');
        if (activeCommentUnsubscribe) {
            activeCommentUnsubscribe();
            activeCommentUnsubscribe = null;
        }
    });

    const filterOptions = document.querySelectorAll('.filter-opt');
    filterOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            filterOptions.forEach(o => o.classList.remove('active-filter'));
            opt.classList.add('active-filter');
            currentFeedFilter = opt.dataset.filter;
            document.querySelector('.section-title h2').textContent = currentFeedFilter === 'mine' ? 'My Dox' : 'Daily Dox';
            document.getElementById('feed-filter-drawer')?.classList.remove('open');
            initRealtimeFeed(); // Reload feed with new filter
        });
    });

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

    // Load Notifications (Real-time from Admin Broadcasts + User Interactions)
    function initRealtimeNotifications() {
        const notiContainer = document.querySelector('.notifications-list');
        const badge = document.querySelector('.notification-badge');
        if (!notiContainer) return;

        let adminNotifs = [];
        let userNotifs = [];

        function renderNotifs() {
            const allNotifs = [...adminNotifs, ...userNotifs].sort((a,b) => {
                const tA = a.timestamp?.toMillis() || 0;
                const tB = b.timestamp?.toMillis() || 0;
                return tB - tA; // desc
            });

            if (allNotifs.length === 0) {
                notiContainer.innerHTML = `<div class="empty-notif"><span class="material-symbols-rounded">notifications_off</span><p>No new updates.</p></div>`;
                if(badge) badge.style.display = 'none';
                return;
            }

            notiContainer.innerHTML = '';
            allNotifs.forEach(n => {
                const item = document.createElement('div');
                item.className = 'notification-item';
                if (n.type === 'admin') {
                    item.innerHTML = `
                        <div class="noti-icon"><span class="material-symbols-rounded">campaign</span></div>
                        <div class="noti-body">
                            <h4>Admin Broadcast</h4>
                            <p>${n.message}</p>
                        </div>
                    `;
                } else {
                    item.innerHTML = `
                        <img src="${n.senderPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                        <div class="noti-body">
                            <h4>${n.senderName} <span>${n.message}</span></h4>
                            <p style="font-size:11px;color:var(--text-muted);margin-top:2px;">${n.timestamp?.toDate().toLocaleTimeString() || 'Just now'}</p>
                        </div>
                    `;
                }
                notiContainer.appendChild(item);
            });
            if (badge) {
                badge.style.display = 'block';
                badge.textContent = allNotifs.length;
            }
        }

        // 1. Admin Broadcasts
        const qAdmin = query(collection(db, "notifications"), orderBy("timestamp", "desc"));
        onSnapshot(qAdmin, (snapshot) => {
            adminNotifs = snapshot.docs.map(doc => ({ ...doc.data(), type: 'admin' }));
            renderNotifs();
        });

        // 2. User specific notifications
        if (auth.currentUser) {
            // No orderBy mapping to avoid complex index requirements at this stage. We sort client-side.
            const qUser = query(collection(db, "user_notifications"), where("recipientId", "==", auth.currentUser.uid));
            onSnapshot(qUser, (snapshot) => {
                userNotifs = snapshot.docs.map(doc => ({ ...doc.data(), type: 'user' }));
                renderNotifs();
            });
        }
    }

    function createPostElement(id, post) {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.dataset.id = id;
        
        const isLiked = post.likedBy?.includes(auth.currentUser?.uid);
        const isSaved = window.currentUserSavedDox?.includes(id);

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
                <button class="interaction-btn like-btn ${isLiked ? 'active' : ''}" data-id="${id}" data-author="${post.authorId}">
                    <span class="material-symbols-rounded">favorite</span>
                    <span class="likes-count">${post.likes || 0}</span>
                </button>
                <button class="interaction-btn comment-btn" data-id="${id}" data-author="${post.authorId}">
                    <span class="material-symbols-rounded">chat_bubble</span>
                    <span class="comments-count">${post.commentsCount || 0}</span>
                </button>
                <button class="interaction-btn save-btn ${isSaved ? 'active' : ''}" data-id="${id}">
                    <span class="material-symbols-rounded">bookmark</span>
                </button>
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
