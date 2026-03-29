/**
 * PARADOX ADMIN - COMMAND CENTER LOGIC
 * Integrated with Firebase Firestore
 */

import { auth, isUserAdmin } from "./auth.js";
import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {

    // 0. Mobile Navigation Logic
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuToggle = document.getElementById('menu-toggle');

    function toggleSidebar() {
        sidebar?.classList.toggle('show');
        overlay?.classList.toggle('show');
    }

    menuToggle?.addEventListener('click', toggleSidebar);
    overlay?.addEventListener('click', toggleSidebar);

    // 1. Security Gate: Only Admin 'yochanbr@gmail.com' can stay
    onAuthStateChanged(auth, (user) => {
        if (!user || !isUserAdmin(user)) {
            console.warn("Unauthorized Access Attempt");
            window.location.href = "index.html"; // Redirect intruders
        }
    });

    // 2. Sidebar Navigation
    const navButtons = document.querySelectorAll('.sidebar-nav .nav-btn');
    const views = document.querySelectorAll('.admin-view');
    const viewTitle = document.getElementById('view-title');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewId = btn.getAttribute('data-view');
            
            // UI Toggle
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // View Switch
            views.forEach(v => v.classList.remove('active'));
            const target = document.getElementById(`view-${viewId}`);
            if (target) target.classList.add('active');

            // Update Header Title
            if (viewTitle) viewTitle.textContent = btn.innerText.trim();

            // Mobile Auto-close
            if (window.innerWidth <= 1024) toggleSidebar();
        });
    });

    // 3. Challenge Forge (PUSH TO FIRESTORE)
    const pushChallengeBtn = document.getElementById('push-challenge-btn');
    pushChallengeBtn?.addEventListener('click', async () => {
        const title = document.getElementById('chal-title').value;
        const reward = document.getElementById('chal-reward').value;
        const rule = document.getElementById('chal-rule').value;

        if (!title || !reward || !rule) {
            showAdminToast('Missing Forge data.');
            return;
        }

        pushChallengeBtn.textContent = 'Forging in Fire...';
        pushChallengeBtn.disabled = true;

        try {
            await addDoc(collection(db, "challenges"), {
                title,
                reward: parseInt(reward),
                rule,
                status: 'active',
                timestamp: serverTimestamp()
            });
            showAdminToast(`DEPLOYED: "${title}" is now live.`);
            resetForm(['chal-title', 'chal-reward', 'chal-rule']);
        } catch (e) {
            showAdminToast('Forge Error: Check permissions');
        } finally {
            pushChallengeBtn.textContent = 'Deploy Challenge';
            pushChallengeBtn.disabled = false;
        }
    });

    // 4. Broadcast Pulse (PUSH TO FIRESTORE)
    const pushBroadcastBtn = document.getElementById('push-broadcast-btn');
    pushBroadcastBtn?.addEventListener('click', async () => {
        const msg = document.getElementById('broadcast-msg').value;

        if (!msg) return;

        pushBroadcastBtn.textContent = 'Pulsing...';
        pushBroadcastBtn.disabled = true;

        try {
            await addDoc(collection(db, "notifications"), {
                message: msg,
                type: 'admin',
                timestamp: serverTimestamp()
            });
            showAdminToast('BROADCAST: Notification sent successfully.');
            resetForm(['broadcast-msg']);
        } catch (e) {
            showAdminToast('Broadcast Error');
        } finally {
            pushBroadcastBtn.textContent = 'Push Alert';
            pushBroadcastBtn.disabled = false;
        }
    });

    // 5. Utilities
    function resetForm(ids) {
        ids.forEach(id => document.getElementById(id).value = '');
    }

    function showAdminToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'admin-toast';
        toast.textContent = message;
        container?.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
    }

});
