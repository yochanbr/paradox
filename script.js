/**
 * PARADOX. - CORE APP LOGIC
 * Integrated with Firebase & Google Identity
 */

import { 
    auth, signOutUser, onAuthStateChanged, isUserAdmin, 
    signInUser, registerUser, sendRecoveryEmail,
    updateUserProfile
} from "./auth.js";
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, updateDoc, increment, getDoc,
    arrayUnion, arrayRemove, setDoc, where, getDocs, deleteDoc
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
    const authEmail = document.getElementById('auth-email');
    const authPass = document.getElementById('auth-password');
    const authPrimaryBtn = document.getElementById('auth-primary-btn');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const authForgotBtn = document.getElementById('auth-forgot-btn');
    const authMainView = document.getElementById('auth-main-view');
    const authForgotView = document.getElementById('auth-forgot-view');
    const recoveryEmail = document.getElementById('recovery-email');
    const sendResetBtn = document.getElementById('send-reset-btn');
    const backToLoginBtn = document.getElementById('back-to-login-btn');

    let isRegistering = false;

    // View Toggles
    authToggleBtn?.addEventListener('click', () => {
        isRegistering = !isRegistering;
        authPrimaryBtn.textContent = isRegistering ? "Create Identity" : "Enter the Paradox";
        authToggleBtn.textContent = isRegistering ? "Returning? Sign In" : "First time? Create Identity";
        authForgotBtn.parentElement.style.display = isRegistering ? 'none' : 'flex';
    });

    authForgotBtn?.addEventListener('click', () => {
        authMainView.classList.add('hidden');
        authForgotView.classList.remove('hidden');
    });

    backToLoginBtn?.addEventListener('click', () => {
        authForgotView.classList.add('hidden');
        authMainView.classList.remove('hidden');
    });

    // Authentication Submission
    authPrimaryBtn?.addEventListener('click', async () => {
        const email = authEmail.value.trim();
        const pass = authPass.value.trim();

        if (!email || !pass) {
            showToast("Credentials required.");
            return;
        }

        try {
            authPrimaryBtn.disabled = true;
            authPrimaryBtn.textContent = isRegistering ? "Creating..." : "Authenticating...";

            if (isRegistering) {
                await registerUser(email, pass);
                showToast("Identity Created.");
            } else {
                await signInUser(email, pass);
                showToast("Welcome back.");
            }
        } catch (err) {
            console.error("Auth Fail:", err);
            // Handle common Firebase errors gracefully
            let msg = "Authentication failed.";
            if (err.code === 'auth/email-already-in-use') msg = "Email already in use.";
            if (err.code === 'auth/invalid-credential') msg = "Incorrect email or key.";
            showToast(msg);
        } finally {
            authPrimaryBtn.disabled = false;
            authPrimaryBtn.textContent = isRegistering ? "Create Identity" : "Enter the Paradox";
        }
    });

    // Recovery Submission
    sendResetBtn?.addEventListener('click', async () => {
        const email = recoveryEmail.value.trim();
        if (!email) {
            showToast("Email required for recovery.");
            return;
        }
        try {
            sendResetBtn.disabled = true;
            await sendRecoveryEmail(email);
            showToast("Recovery link sent.");
            backToLoginBtn.click();
        } catch (err) {
            showToast("Recovery failed.");
        } finally {
            sendResetBtn.disabled = false;
        }
    });

    // Monitor Auth State
    onAuthStateChanged(auth, async (user) => {
        if (LOCAL_DEV_MODE) {
            console.warn("DEV MODE ACTIVE: Bypassing auth check.");
            loginOverlay?.classList.add('hidden');
            return;
        }

        if (user) {
            console.log("Identity Verified:", user.email);
            loginOverlay?.classList.add('hidden');
            document.body.style.overflow = 'auto';
            
            // Sync UI with Profile (with fallback for very new users)
            const profileName = document.querySelector('.hero-name');
            const profileAvatar = document.querySelector('.hero-avatar');
            const headerAvatar = document.querySelector('.user-chip img');
            
            const nameToDisplay = user.displayName || user.email.split('@')[0];
            const photoToDisplay = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${nameToDisplay}`;

            if (profileName) profileName.textContent = nameToDisplay;
            if (profileAvatar) profileAvatar.src = photoToDisplay;
            if (headerAvatar) headerAvatar.src = photoToDisplay;

            // Personalize Public Header
            const publicHeader = document.getElementById('public-dox-header');
            if (publicHeader) publicHeader.textContent = `${nameToDisplay}'s Dox`;

            // Sync Composer Avatars
            const homeComposerAvatar = document.getElementById('home-composer-avatar');
            const commenterAvatar = document.getElementById('commenter-avatar');
            if (homeComposerAvatar) homeComposerAvatar.src = photoToDisplay;
            if (commenterAvatar) commenterAvatar.src = photoToDisplay;

            // Load App Data
            loadUserStats(user.uid);
            loadFeed();
            initRealtimeChallenges();
            initRealtimeNotifications();
            runNotificationCleanup(user.uid);

            // Security: Check for Admin Portal
            const adminPortalLink = document.querySelector('a[href="admin.html"]')?.parentElement;
            if (adminPortalLink) {
                adminPortalLink.style.display = isUserAdmin(user) ? 'flex' : 'none';
            }
        } else {
            loginOverlay?.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
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
    wireDrawer('open-my-public-dox-btn', 'my-public-dox-drawer', 'close-my-public-dox-btn');
    wireDrawer('open-feed-filter-btn', 'feed-filter-drawer', 'close-feed-filter-btn');
    wireDrawer('open-diary-btn', 'diary-drawer', 'close-diary-btn');
    wireDrawer('close-edit-post-btn', 'edit-post-drawer', 'close-edit-post-btn');
    wireDrawer('open-notifications-btn', 'notification-drawer', 'close-notifications-btn');

    // Profile Edit Logic (Diary)
    const openDiaryBtn = document.getElementById('open-diary-btn');
    const editNameInput = document.getElementById('edit-display-name');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const avatarGrid = document.getElementById('avatar-selection-grid');
    const diaryPfpPreview = document.getElementById('diary-pfp');
    let selectedAvatarUrl = null;

    openDiaryBtn?.addEventListener('click', () => {
        if (auth.currentUser && editNameInput) {
            editNameInput.value = auth.currentUser.displayName || "";
            if (diaryPfpPreview) diaryPfpPreview.src = auth.currentUser.photoURL || "";
            selectedAvatarUrl = auth.currentUser.photoURL || null;
            
            // Pre-select current avatar in grid
            avatarGrid?.querySelectorAll('.avatar-item').forEach(item => {
                item.classList.toggle('selected', item.getAttribute('data-url') === selectedAvatarUrl);
            });
        }
    });

    avatarGrid?.querySelectorAll('.avatar-item').forEach(item => {
        item.addEventListener('click', () => {
            avatarGrid.querySelectorAll('.avatar-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedAvatarUrl = item.getAttribute('data-url');
            if (diaryPfpPreview) diaryPfpPreview.src = selectedAvatarUrl;
        });
    });

    saveProfileBtn?.addEventListener('click', async () => {
        const newName = editNameInput.value.trim();
        if (!newName) {
            showToast("Identity Key cannot be empty.");
            return;
        }

        try {
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = "Saving...";
            
            await updateUserProfile(newName, selectedAvatarUrl);
            showToast("Identity updated.");
            
            // Sync current drawer UI immediately
            const diaryName = document.getElementById('diary-name');
            if (diaryName) diaryName.textContent = newName;
            
            document.getElementById('diary-drawer')?.classList.remove('open');
        } catch (err) {
            console.error("Identity Update Fail:", err);
            showToast(err.message || "Failed to update Identity.");
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.innerHTML = `<span class="material-symbols-rounded">save</span> Save Identity`;
        }
    });

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
    // 4. LOADING SKELETONS & FEED ENGINE
    // ==========================================
    
    function renderSkeletonPosts(container, count = 3) {
        if (!container) return;
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-post">
                    <div class="skeleton-header">
                        <div class="skeleton skeleton-avatar"></div>
                        <div class="skeleton-meta">
                            <div class="skeleton skeleton-name"></div>
                            <div class="skeleton skeleton-date"></div>
                        </div>
                    </div>
                    <div class="skeleton skeleton-content-line"></div>
                    <div class="skeleton skeleton-content-line"></div>
                    <div class="skeleton skeleton-content-line short"></div>
                    <div class="skeleton-footer">
                        <div class="skeleton skeleton-btn"></div>
                        <div class="skeleton skeleton-btn"></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function renderSkeletonChallenges(container) {
        if (!container) return;
        container.innerHTML = `
            <div class="skeleton-challenge">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-rule"></div>
                <div class="skeleton skeleton-rule" style="width: 80%;"></div>
                <div class="skeleton-meta-grid">
                    <div class="skeleton" style="width: 80px; height: 32px; border-radius: 8px;"></div>
                </div>
            </div>
        `;
    }

    function renderSkeletonNotifications(container, count = 4) {
        if (!container) return;
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-notif">
                    <div class="skeleton skeleton-notif-avatar"></div>
                    <div class="skeleton-notif-body">
                        <div class="skeleton" style="width: 50%; height: 12px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 80%; height: 8px;"></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    // Load Posts
    let currentFeedFilter = 'global';

    async function loadMyPublicDox() {
        const container = document.getElementById('my-dox-list');
        if (!container || !auth.currentUser) return;

        renderSkeletonPosts(container, 3);

        try {
            // FIX: If this exact query is stuck, it's usually a missing composite index on Firestore.
            // We'll try to fetch with a fallback: query without order first, then sort locally to avoid blocking user.
            let snap;
            try {
                const q = query(collection(db, "posts"), where("authorId", "==", auth.currentUser.uid), orderBy("timestamp", "desc"));
                snap = await getDocs(q);
            } catch (indexError) {
                console.warn("Index not found, falling back to local sort.", indexError);
                const fallbackQ = query(collection(db, "posts"), where("authorId", "==", auth.currentUser.uid));
                snap = await getDocs(fallbackQ);
            }
            
            if (snap.empty) {
                container.innerHTML = `<div class="empty-state-mini"><span class="material-symbols-rounded">history_edu</span><p>You haven't shared anything yet.</p></div>`;
                return;
            }

            // Convert scrollable data and sort locally (fallback)
            const postsArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            postsArr.sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

            container.innerHTML = '';
            postsArr.forEach(post => {
                container.appendChild(createPostElement(post.id, post));
            });
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="empty-state-mini"><span class="material-symbols-rounded">error</span><p>Failed to load. Link to index might be in console.</p></div>`;
        }
    }

    document.getElementById('open-my-public-dox-btn')?.addEventListener('click', loadMyPublicDox);

    async function loadFeed() {
        const feedContainer = document.getElementById('home-feed');
        if (!feedContainer) return;
        
        renderSkeletonPosts(feedContainer, 4);
        
        try {
            const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);
            
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
        } catch (e) {
            console.error("Failed to load feed", e);
            feedContainer.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>Could not load paradoxes.</p></div>`;
        }
    }

    // Export so filter/refresh buttons can trigger it manually
    window.refreshMainFeed = loadFeed;

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
    let activeCommentParentId = null; // Used for replying

    function renderCommentTree(commentsList, commentsMap, parentId = null, depth = 0) {
        const children = commentsMap.get(parentId) || [];
        
        children.forEach(c => {
            const div = document.createElement('div');
            // Add indentation logic for replies
            div.className = depth === 0 ? 'comment-bubble' : 'comment-bubble comment-reply';
            // Cap depth visual indentation to prevent squeezing
            const indent = Math.min(depth * 24, 48); 
            if (depth > 0) div.style.marginLeft = `${indent}px`;

            const isCurrentUser = auth.currentUser && c.authorId === auth.currentUser.uid;
            const authorName = isCurrentUser ? auth.currentUser.displayName : c.authorName;
            const authorPhoto = isCurrentUser ? auth.currentUser.photoURL : (c.authorPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop');

            div.innerHTML = `
                <img src="${authorPhoto}" class="tiny-avatar">
                <div class="comment-body">
                    <h4>${authorName} <span>${c.timestamp?.toDate().toLocaleDateString() || 'Now'}</span></h4>
                    <p>${c.text}</p>
                    <button class="reply-trigger-btn" data-id="${c.id}" data-name="${authorName}">Reply</button>
                </div>
            `;
            commentsList.appendChild(div);

            // Recursively render children
            renderCommentTree(commentsList, commentsMap, c.id, depth + 1);
        });
    }

    function openCommentsDrawer(postId, authorId) {
        activeCommentPostId = postId;
        activeCommentPostAuthor = authorId;
        activeCommentParentId = null;
        
        // Setup UI Profile for Input
        const commenterAvatar = document.getElementById('commenter-avatar');
        if (commenterAvatar && auth.currentUser) commenterAvatar.src = auth.currentUser.photoURL;

        const commentsList = document.getElementById('comments-list');
        const input = document.getElementById('comment-input');
        const sendBtn = document.getElementById('send-comment-btn');
        
        input.value = '';
        input.placeholder = 'Add a comment...';
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
            
            // Build adjacency list for tree
            const commentsMap = new Map();
            snapshot.forEach((docSnap) => {
                const c = { id: docSnap.id, ...docSnap.data() };
                const pId = c.parentId || null;
                if (!commentsMap.has(pId)) commentsMap.set(pId, []);
                commentsMap.get(pId).push(c);
            });

            renderCommentTree(commentsList, commentsMap, null, 0);

            // Wire Reply Buttons
            commentsList.querySelectorAll('.reply-trigger-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeCommentParentId = btn.dataset.id;
                    input.placeholder = `Replying to @${btn.dataset.name}...`;
                    input.focus();
                });
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
                    parentId: activeCommentParentId, // Stores nest tree mapping
                    timestamp: serverTimestamp()
                });

                // Update post count
                await updateDoc(doc(db, "posts", activeCommentPostId), {
                    commentsCount: increment(1)
                });
                
                // Notify Author
                notifyUser(activeCommentPostAuthor, "replied to your paradox.");
                
                cInput.value = '';
                cInput.placeholder = 'Add a comment...';
                activeCommentParentId = null;
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
        activeCommentParentId = null;
        const cInput = document.getElementById('comment-input');
        if (cInput) cInput.placeholder = 'Add a comment...';
    });

    const filterOptions = document.querySelectorAll('.filter-opt');
    filterOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            currentFeedFilter = opt.dataset.filter;
            filterOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            
            const headerTitle = document.querySelector('.section-title h2');
            if (headerTitle) {
                headerTitle.textContent = currentFeedFilter === 'global' ? 'Daily Dox' : 'My Dox';
            }
            
            document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
            window.refreshMainFeed(); // Hard reload the feed with new filter
        });
    });

    // Refresh Feed Button
    document.getElementById('refresh-feed-btn')?.addEventListener('click', () => {
        window.refreshMainFeed();
    });

    // Load Challenges (Real-time from Admin)
    function initRealtimeChallenges() {
        const challengesContainer = document.getElementById('challenges-container');
        if (!challengesContainer) return;

        renderSkeletonChallenges(challengesContainer);

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
        const notiContainer = document.querySelector('.notification-list'); // Fix: Was targeting .notifications-list in error above, but drawer ID is #notification-list
        const badge = document.querySelector('.notification-badge');
        if (!notiContainer) return;

        renderSkeletonNotifications(notiContainer, 5);

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
                userNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'user' }));
                renderNotifs();
            });
        }
    }

    // Mandatory 7rd Day Notification Cleanup
    async function runNotificationCleanup(uid) {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const q = query(collection(db, "user_notifications"), where("recipientId", "==", uid));
            const snap = await getDocs(q);
            
            let deletedCount = 0;
            const promises = [];
            
            snap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.timestamp && data.timestamp.toDate() < sevenDaysAgo) {
                    promises.push(deleteDoc(docSnap.ref));
                    deletedCount++;
                }
            });

            if (promises.length > 0) {
                await Promise.all(promises);
                console.log(`Auto-cleaned ${deletedCount} old notifications.`);
            }
        } catch (err) {
            console.error("Cleanup Error:", err);
        }
    }

    // Manual Clear All Notifications
    document.getElementById('clear-all-notifs-btn')?.addEventListener('click', async () => {
        if (!auth.currentUser) return;
        if (!confirm("Clear all notifications?")) return;

        const btn = document.getElementById('clear-all-notifs-btn');
        const originalText = btn.textContent;
        btn.textContent = "CLEARING...";
        btn.disabled = true;

        try {
            const q = query(collection(db, "user_notifications"), where("recipientId", "==", auth.currentUser.uid));
            const snap = await getDocs(q);
            
            const promises = snap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(promises);
            showToast("Notifications Cleared");
        } catch (err) {
            console.error(err);
            showToast("Clear failed.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    function createPostElement(id, post) {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.dataset.id = id;
        
        const isLiked = post.likedBy?.includes(auth.currentUser?.uid);
        const isAuthor = auth.currentUser && post.authorId === auth.currentUser.uid;

        const displayPhoto = isAuthor ? auth.currentUser.photoURL : (post.authorPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop');
        const displayName = isAuthor ? auth.currentUser.displayName : post.authorName;

        div.innerHTML = `
            <div class="post-header">
                <div class="header-left">
                    <img src="${displayPhoto}" class="post-avatar">
                    <div class="post-meta">
                        <h4>${displayName}</h4>
                        <div class="meta-bottom">
                            <span>${post.timestamp?.toDate().toLocaleDateString() || 'Just now'}</span>
                            ${post.edited ? '<span class="edited-tag">• edited</span>' : ''}
                        </div>
                    </div>
                </div>
                ${isAuthor ? `
                <div class="post-actions-wrapper">
                    <button class="icon-btn post-more-btn">
                        <span class="material-symbols-rounded">more_horiz</span>
                    </button>
                    <div class="post-actions-menu">
                        <button class="action-item edit-trigger"><span class="material-symbols-rounded">edit</span>Edit</button>
                        <button class="action-item delete-trigger text-danger"><span class="material-symbols-rounded">delete</span>Delete</button>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="post-content"><p>${post.text}</p></div>
            <div class="post-interactions" style="z-index: 5;">
                <button class="interaction-btn like-btn ${isLiked ? 'active' : ''}" data-id="${id}" data-author="${post.authorId}">
                    <span class="material-symbols-rounded" style="pointer-events: none;">favorite</span>
                    <span class="likes-count">${post.likes || 0}</span>
                </button>
                <button class="interaction-btn comment-btn" data-id="${id}" data-author="${post.authorId}">
                    <span class="material-symbols-rounded" style="pointer-events: none;">chat_bubble</span>
                    <span class="comments-count">${post.commentsCount || 0}</span>
                </button>
            </div>
        `;

        // Direct Attachments for Flawless Mobile Touch
        const likeBtn = div.querySelector('.like-btn');
        const commentBtn = div.querySelector('.comment-btn');
        const moreBtn = div.querySelector('.post-more-btn');
        const editBtn = div.querySelector('.edit-trigger');
        const deleteBtn = div.querySelector('.delete-trigger');

        const attachTouch = (btn, handler) => {
            if (!btn) return;
            btn.addEventListener('click', handler);
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handler(e);
            }, { passive: false });
        };

        // Toggle Actions Menu
        attachTouch(moreBtn, (e) => {
            if (e) e.stopPropagation();
            const menu = div.querySelector('.post-actions-menu');
            menu?.classList.toggle('active');
            
            // Close other menus if open
            document.querySelectorAll('.post-actions-menu.active').forEach(m => {
                if (m !== menu) m.classList.remove('active');
            });
        });

        // Delete Logic
        attachTouch(deleteBtn, async (e) => {
            if (e) e.stopPropagation();
            if (confirm("Are you sure you want to delete this paradox?")) {
                try {
                    await deleteDoc(doc(db, "posts", id));
                    showToast("Paradox Deleted");
                    div.remove();
                } catch (err) {
                    console.error(err);
                    showToast("Failed to delete post.");
                }
            }
        });

        // Edit Logic
        attachTouch(editBtn, (e) => {
            if (e) e.stopPropagation();
            openEditPostDrawer(id, post.text);
            div.querySelector('.post-actions-menu').classList.remove('active');
        });

        attachTouch(likeBtn, async (e) => {
            if (e) e.stopPropagation();
            if (!auth.currentUser) return showToast("Please login to like.");
            
            const isLiked = likeBtn.classList.contains('active');
            
            // Optimistic UI toggle immediately for responsiveness
            likeBtn.classList.toggle('active');
            const countSpan = likeBtn.querySelector('.likes-count');
            countSpan.textContent = parseInt(countSpan.textContent) + (isLiked ? -1 : 1);

            const postRef = doc(db, "posts", id);
            await updateDoc(postRef, {
                likedBy: isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid),
                likes: increment(isLiked ? -1 : 1)
            });

            // Fire notification if it's a fresh like
            if (!isLiked) {
                notifyUser(post.authorId, "liked your paradox.");
            }
        });

        attachTouch(commentBtn, (e) => {
            if (e) e.stopPropagation();
            openCommentsDrawer(id, post.authorId);
        });

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

    // ==========================================
    // Post Editing System
    // ==========================================
    let activeEditPostId = null;

    function openEditPostDrawer(postId, currentText) {
        activeEditPostId = postId;
        const input = document.getElementById('edit-post-input');
        if (input) {
            input.value = currentText;
            document.getElementById('edit-post-drawer').classList.add('open');
            input.focus();
        }
    }

    document.getElementById('update-post-btn')?.addEventListener('click', async () => {
        const text = document.getElementById('edit-post-input').value.trim();
        if (!text || !activeEditPostId) return;

        const btn = document.getElementById('update-post-btn');
        btn.textContent = "UPDATING...";
        btn.disabled = true;

        try {
            await updateDoc(doc(db, "posts", activeEditPostId), {
                text: text,
                edited: true,
                editedAt: serverTimestamp()
            });
            showToast("Paradox Updated");
            document.getElementById('edit-post-drawer').classList.remove('open');
            window.refreshMainFeed(); // Refresh to show changes
        } catch (err) {
            console.error(err);
            showToast("Failed to update post.");
        } finally {
            btn.textContent = "UPDATE";
            btn.disabled = false;
        }
    });

    // Close options menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-actions-wrapper')) {
            document.querySelectorAll('.post-actions-menu.active').forEach(m => m.classList.remove('active'));
        }
    });

    initDates();
    initDateScroller(); // Launch the dynamic date scroller
    initGoalComposerListeners(); // Mobilize the intention form
});

// ==========================================
// 8. DYNAMIC DATE SCROLLER ENGINE
// ==========================================

function initDateScroller() {
    const scroller = document.getElementById('dynamic-date-scroller');
    const label = document.getElementById('month-label');
    if (!scroller || !label) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    // 1. Update Month/Year Label (e.g., "March 2026")
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
    label.textContent = monthFormatter.format(now);

    // 2. Clear Existing Content
    scroller.innerHTML = '';

    // 3. Generate Days of the Month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayStr = dayFormatter.format(dateObj).toUpperCase();
        
        const dateItem = document.createElement('div');
        dateItem.className = 'date-item';
        if (day === today) dateItem.classList.add('active');

        dateItem.innerHTML = `
            <span>${dayStr}</span>
            <span>${day}</span>
        `;

        scroller.appendChild(dateItem);

        // Interactive: Tap to Select & Center
        dateItem.addEventListener('click', () => {
            scroller.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
            dateItem.classList.add('active');
            dateItem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });

        // Initial Auto-center "Today"
        if (day === today) {
            setTimeout(() => {
                dateItem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }, 800);
        }
    }
}

// ==========================================
// 9. GOAL COMPOSER ENGINE (TOUCH FIX)
// ==========================================

function initGoalComposerListeners() {
    // 1. Time Pill Selectors (Today/Tomorrow/Custom)
    const pills = document.querySelectorAll('.pill-opt');
    const customDateContainer = document.getElementById('custom-date-container');

    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            // Toggle Custom Date Input
            if (pill.getAttribute('data-time') === 'custom') {
                if (customDateContainer) customDateContainer.style.display = 'block';
            } else {
                if (customDateContainer) customDateContainer.style.display = 'none';
            }
        });
    });

    // 2. Day Chip Multi-Select
    const dayChips = document.querySelectorAll('.day-chip');
    dayChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault(); // Standard for buttons in forms
            chip.classList.toggle('active');
        });
    });

    // 3. Save Intention Button
    const saveGoalBtn = document.getElementById('save-goal-btn');
    const goalInput = document.querySelector('.goal-input-large');
    const timeInput = document.querySelector('.form-section input[type="time"]');

    saveGoalBtn?.addEventListener('click', async () => {
        if (!auth.currentUser) {
            showToast("Login to set intentions.");
            return;
        }

        const text = goalInput.value.trim();
        if (!text) {
            showToast("What is your intention?");
            return;
        }

        const activePill = document.querySelector('.pill-opt.active');
        const activeDays = Array.from(document.querySelectorAll('.day-chip.active')).map(c => c.textContent);
        const selectedTime = timeInput ? timeInput.value : "08:00";
        
        let targetDate = new Date();
        const type = activePill ? activePill.getAttribute('data-time') : 'today';
        if (type === 'tomorrow') {
            targetDate.setDate(targetDate.getDate() + 1);
        } else if (type === 'custom') {
            const customDate = document.getElementById('custom-goal-date');
            if (customDate && customDate.value) targetDate = new Date(customDate.value);
        }

        try {
            saveGoalBtn.disabled = true;
            saveGoalBtn.textContent = "Setting Intention...";

            await addDoc(collection(db, "goals"), {
                uid: auth.currentUser.uid,
                text: text,
                timeType: type,
                targetDate: targetDate.toISOString(),
                repeatDays: activeDays,
                reminderTime: selectedTime,
                status: "active",
                createdAt: serverTimestamp()
            });

            showToast("Intention Set.");
            
            // Success Routine
            goalInput.value = '';
            dayChips.forEach(c => c.classList.remove('active'));
            document.querySelector('.drawer-overlay.active')?.click(); // Close drawer
            
        } catch (err) {
            console.error("Save Failed", err);
            showToast("Couldn't save intention.");
        } finally {
            saveGoalBtn.disabled = false;
            saveGoalBtn.textContent = "Set Intention";
        }
    });
}
